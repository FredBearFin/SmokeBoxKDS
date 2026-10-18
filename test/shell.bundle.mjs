// Builds a private bundle of ONLY the shell layer (tokens, base CSS, util, config, icons, shell, boot) into test/.out/shell.html.
// The real dist/smokebox.html inlines every module in src/, including other agents' work in progress; this keeps shell tests isolated.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHELL_OUT = path.join(root, 'test/.out/shell.html');
const CSS = ['00-tokens.css', '10-base.css'];
const JS = ['00-util.js', '05-icons.js', '10-config.js', '60-shell.js', '99-boot.js'];

export function buildShell(out = SHELL_OUT, { js = JS, css = CSS } = {}) {
  let c = '';
  for (const f of css) c += `\n/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(root, 'src/css', f), 'utf8');
  let j = '';
  for (const f of js) {
    const body = fs.readFileSync(path.join(root, 'src/js', f), 'utf8');
    j += `\n/* ===== ${f} ===== */\n;try{\n${body}\n}catch(e){console.error('[smokebox] module ${f} failed to load:',e);window.__sbLoadErrors=(window.__sbLoadErrors||[]);window.__sbLoadErrors.push({file:'${f}',message:String(e&&e.message||e)});}\n`;
  }
  const tpl = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
  const html = tpl.replace('<!--SB:CSS-->', () => `<style>${c}\n</style>`).replace('<!--SB:JS-->', () => `<script>${j}\n</script>`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('built', buildShell());
