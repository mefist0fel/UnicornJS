#!/usr/bin/env python3
"""Full js13k release pipeline: concatenate html/js/*.js (order taken from
html/index.html), minify locally with google-closure-compiler, inline the
result into html/packed/index.html, zip it, and drop a copy of the zip both
next to this script and in dist/. See docs/build.md.

  python html/packed/build.py                just build/minify/zip
  python html/packed/build.py --skip-minify   fast unminified sanity build only
                                               (no zip - wouldn't reflect real size)
"""
import datetime
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

PACKED_DIR = Path(__file__).resolve().parent
HTML_DIR = PACKED_DIR.parent
ROOT_DIR = HTML_DIR.parent
INDEX_HTML = HTML_DIR / 'index.html'
BUNDLE_JS = PACKED_DIR / 'bundle.js'
BUNDLE_MIN_JS = PACKED_DIR / 'bundle.min.js'
OUT_HTML = PACKED_DIR / 'index.html'
# same page, unminified sources inlined - open this to get real stack traces
# (the minified build mangles names; ADVANCED-mode bugs only show here as the
# original identifiers). Written on every build, never zipped.
DEV_HTML = PACKED_DIR / 'index.dev.html'
PACKED_ZIP = PACKED_DIR / 'game.zip'
DIST_ZIP = ROOT_DIR / 'dist' / 'game.zip'
# accumulating build-size history, one row per release build (appended, tracked
# in git). See docs/build.md.
BUILD_LOG = PACKED_DIR / 'build_log.md'
BUILD_LOG_HEADER = (
	'# История сборок\n\n'
	'Автодополняется `build.py` на каждой релизной сборке (не `--skip-minify`).\n'
	'Размеры в байтах, разделитель разрядов — пробел. Лимит зипа — 13 312.\n\n'
	'| дата | bundle.min.js | index.html | game.zip | до лимита |\n'
	'|---|---:|---:|---:|---:|\n'
)
SCRIPT_TAG_RE = re.compile(r'[ \t]*<script src="(js/[^"]+\.js)"></script>\n?')
SIZE_BUDGET = 13312  # js13k zip limit, bytes
CLOSURE_COMPILER = 'google-closure-compiler'


def read(path):
	return path.read_text(encoding='utf-8')


def write(path, text):
	path.parent.mkdir(parents=True, exist_ok=True)
	path.write_text(text, encoding='utf-8')


def sep(n):
	"""12345 -> '12 345', -2383 -> '-2 383' (space thousands separator)."""
	return f'{n:,}'.replace(',', ' ')


def log_build(min_js, out_html, zip_bytes, left):
	if not BUILD_LOG.exists():
		BUILD_LOG.write_text(BUILD_LOG_HEADER, encoding='utf-8')
	stamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
	row = f'| {stamp} | {sep(min_js)} | {sep(out_html)} | {sep(zip_bytes)} | {sep(left)} |\n'
	with BUILD_LOG.open('a', encoding='utf-8') as f:
		f.write(row)


def concat_sources():
	html = read(INDEX_HTML)
	matches = list(SCRIPT_TAG_RE.finditer(html))
	if not matches:
		sys.exit('no <script src="js/...js"> tags found in html/index.html')
	sources = [m.group(1) for m in matches]
	bundle = '\n'.join(read(HTML_DIR / src) for src in sources)
	write(BUNDLE_JS, bundle)
	return html, matches, bundle


def minify():
	exe = shutil.which(CLOSURE_COMPILER)
	if not exe:
		sys.exit(f'{CLOSURE_COMPILER} not found on PATH - install it with '
		         f'"npm install -g google-closure-compiler" (see docs/build.md)')
	# .CMD shim on Windows needs shell=True to resolve.
	r = subprocess.run(
		[exe, '-O', 'ADVANCED', '--js', str(BUNDLE_JS), '--js_output_file', str(BUNDLE_MIN_JS)],
		capture_output=True, text=True, shell=True)
	if r.stdout:
		print(r.stdout)
	if r.returncode != 0:
		sys.exit(f'{CLOSURE_COMPILER} failed:\n{r.stderr}')
	if r.stderr:
		print(r.stderr)  # warnings - compiler still succeeded


def inline_script(html, matches, script_body):
	start = matches[0].start()
	end = matches[-1].end()
	tag = '<script>\n' + script_body + '\n</script>\n'
	return html[:start] + tag + html[end:]


def main():
	skip_minify = '--skip-minify' in sys.argv[1:]
	html, matches, bundle = concat_sources()

	# always refresh the unminified full-inline page for debugging
	write(DEV_HTML, inline_script(html, matches, bundle))
	print(f'wrote {DEV_HTML} (unminified, full sources inlined, no zip)')

	if skip_minify:
		write(OUT_HTML, inline_script(html, matches, bundle))
		print(f'wrote {BUNDLE_JS} + {OUT_HTML} (unminified sanity build, no zip)')
		return

	# release: kill the debug flag so closure DCEs every `if (DEBUG) ...` block
	# (debug menu, enemy spawners, preview jumps) and debug.js with it.
	n = bundle.count('const DEBUG = true')
	if n != 1:
		sys.exit(f'expected exactly one `const DEBUG = true` in the bundle, found {n}')
	bundle = bundle.replace('const DEBUG = true', 'const DEBUG = !1')
	write(BUNDLE_JS, bundle)

	minify()

	final_html = inline_script(html, matches, read(BUNDLE_MIN_JS))
	write(OUT_HTML, final_html)

	for zip_path in (PACKED_ZIP, DIST_ZIP):
		zip_path.parent.mkdir(parents=True, exist_ok=True)
		with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
			z.writestr('index.html', final_html)

	size = PACKED_ZIP.stat().st_size
	left = SIZE_BUDGET - size
	log_build(BUNDLE_MIN_JS.stat().st_size, OUT_HTML.stat().st_size, size, left)
	print(f'wrote {OUT_HTML}')
	print(f'wrote {PACKED_ZIP} and {DIST_ZIP}: {size} bytes ({left} bytes left of {SIZE_BUDGET})')
	print(f'appended a row to {BUILD_LOG}')
	if left < 0:
		sys.exit('OVER BUDGET')


if __name__ == '__main__':
	main()
