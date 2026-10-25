//! The identical-replay check: random kitchens recorded by the JavaScript engine in Node (tools/make-replay.mjs) are replayed
//! through the server's own engine, and every kitchen must end with exactly the same saved state, and every action must get
//! the same answer. Set SMOKEBOX_REPLAY to a recorded file to use it; otherwise 200 kitchens are recorded on the spot (needs Node).

use smokebox_server::kitchen::Kitchens;
use std::io::BufRead;

// Reads the recorded kitchens: the file in SMOKEBOX_REPLAY, or a fresh recording from Node.
fn recorded() -> Vec<String> {
    if let Ok(path) = std::env::var("SMOKEBOX_REPLAY") {
        let f = std::fs::File::open(&path).expect("SMOKEBOX_REPLAY file");
        return std::io::BufReader::new(f).lines().map(|l| l.unwrap()).filter(|l| !l.is_empty()).collect();
    }
    let out = std::process::Command::new("node")
        .args(["../tools/make-replay.mjs", "200", "60"])
        .output()
        .expect("node is needed to record kitchens");
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8(out.stdout).unwrap().lines().filter(|l| !l.is_empty()).map(String::from).collect()
}

#[test]
fn every_recorded_kitchen_replays_byte_for_byte() {
    let k = Kitchens::new().expect("the engine loads");
    let lines = recorded();
    assert!(!lines.is_empty());
    let (mut kitchens, mut actions) = (0, 0);
    for line in &lines {
        let rec: serde_json::Value = serde_json::from_str(line).unwrap();
        let id = format!("k{}", rec["seed"]);
        k.create(&id, &rec["start"]).unwrap();
        for st in rec["steps"].as_array().unwrap() {
            if let Some(t) = st.get("tick") {
                k.tick(&id, t.as_i64().unwrap()).unwrap();
                continue;
            }
            let a = k.apply(&id, st["type"].as_str().unwrap(), &st["payload"], st["now"].as_i64().unwrap()).unwrap();
            assert_eq!(a.report, st["report"].as_str().unwrap(), "kitchen {} action {} answered differently", id, st["type"]);
            actions += 1;
        }
        let saved = k.serialize(&id).unwrap();
        assert!(saved == rec["final"].as_str().unwrap(), "kitchen {} ended with a different saved state", id);
        k.drop_kitchen(&id).unwrap();
        kitchens += 1;
    }
    eprintln!("replayed {} kitchens, {} actions: identical", kitchens, actions);
}

#[test]
fn a_saved_kitchen_loads_back_and_keeps_working() {
    let k = Kitchens::new().unwrap();
    let t0 = 1_792_854_000_000i64;
    k.create("a", &serde_json::json!({ "now": t0, "blank": true })).unwrap();
    let r = k.apply("a", "addMenuItem", &serde_json::json!({ "name": "Fries", "zone": "fry", "cat": "fried", "price": 4, "prepSec": 420, "track": "two" }), t0 + 1000).unwrap();
    assert_eq!(r.report, "ok");
    let saved = k.serialize("a").unwrap();
    k.load("b", &saved).unwrap();
    // Loading checks and repairs a save the same way a tablet does; the content is the same (field order may differ).
    let same = |x: &str| serde_json::from_str::<serde_json::Value>(x).unwrap();
    assert_eq!(same(&k.serialize("b").unwrap()), same(&saved));
    assert!(k.load("c", "not a save").is_err());
    // With a station limit the planner runs natively: a third fries waits for a basket.
    k.apply("b", "updateSettings", &serde_json::json!({ "patch": { "capacity": { "fry": 2 } } }), t0 + 2000).unwrap();
    let id = serde_json::from_str::<serde_json::Value>(&saved).unwrap()["menu"][0]["id"].as_str().unwrap().to_string();
    for i in 0..3 {
        let r = k.apply("b", "createTicket", &serde_json::json!({ "customer": format!("G{}", i), "items": [{ "menuId": id }] }), t0 + 3000).unwrap();
        assert_eq!(r.report, "ok");
    }
    let s: serde_json::Value = serde_json::from_str(&k.serialize("b").unwrap()).unwrap();
    let third = &s["tickets"][2]["items"][0];
    assert!(third["freeAt"].as_i64().is_some(), "the third fries waits for a free basket: {}", third);
}
