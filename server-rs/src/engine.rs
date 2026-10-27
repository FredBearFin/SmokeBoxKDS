//! The engine thread. The JavaScript runtime that runs the kitchen engine must stay on one thread, so it lives on its own
//! thread and the rest of the server sends it work: a closure that gets the `Kitchens` and returns an answer. Work runs one at a
//! time, in the order it arrives, which is also what keeps every kitchen's actions in one order.

use crate::kitchen::Kitchens;
use std::sync::mpsc;
use tokio::sync::oneshot;

type Job = Box<dyn FnOnce(&Kitchens) + Send>;

/// A handle to the engine thread. Cloning it is cheap; every clone sends to the same thread.
#[derive(Clone)]
pub struct Engine {
    tx: mpsc::Sender<Job>,
}

impl Engine {
    /// Starts the engine thread and loads the engine. Fails when the engine files do not run.
    pub fn start() -> Result<Engine, String> {
        let (tx, rx) = mpsc::channel::<Job>();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
        std::thread::Builder::new()
            .name("kitchen-engine".into())
            .spawn(move || {
                let k = match Kitchens::new() {
                    Ok(k) => {
                        let _ = ready_tx.send(Ok(()));
                        k
                    }
                    Err(e) => {
                        let _ = ready_tx.send(Err(e));
                        return;
                    }
                };
                // Runs each job as it arrives until every handle is gone.
                for job in rx {
                    job(&k);
                }
            })
            .map_err(|e| e.to_string())?;
        ready_rx.recv().map_err(|e| e.to_string())??;
        Ok(Engine { tx })
    }

    /// True when the engine thread is alive and answers within 2 seconds (for the health check).
    pub async fn alive(&self) -> bool {
        let (tx, rx) = oneshot::channel();
        let job: Job = Box::new(move |_| {
            let _ = tx.send(());
        });
        if self.tx.send(job).is_err() {
            return false;
        }
        matches!(tokio::time::timeout(std::time::Duration::from_secs(2), rx).await, Ok(Ok(())))
    }

    /// Runs `f` on the engine thread and waits for its answer without blocking the async runtime.
    pub async fn run<R, F>(&self, f: F) -> R
    where
        R: Send + 'static,
        F: FnOnce(&Kitchens) -> R + Send + 'static,
    {
        let (tx, rx) = oneshot::channel();
        let job: Job = Box::new(move |k| {
            let _ = tx.send(f(k));
        });
        self.tx.send(job).expect("the engine thread is running");
        rx.await.expect("the engine thread answered")
    }
}
