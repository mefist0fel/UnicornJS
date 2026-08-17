#!/usr/bin/env python3
"""Concatenate html/js/*.js (order taken from html/index.html) and inline
them into html/packed/index.html. See docs/build.md.

  python html/packed/build.py          concat only, unminified sanity build
  python html/packed/build.py --pack   use bundle.min.js, write dist/game.zip
"""
import re
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
DIST_ZIP = ROOT_DIR / 'dist' / 'game.zip'
SCRIPT_TAG_RE = re.compile(r'[ \t]*<script src="(js/[^"]+\.js)"></script>\n?')
SIZE_BUDGET = 13312  # js13k zip limit, bytes


def read(path):
	return path.read_text(encoding='utf-8')


def write(path, text):
	path.parent.mkdir(parents=True, exist_ok=True)
	path.write_text(text, encoding='utf-8')


def concat_sources():
	html = read(INDEX_HTML)
	matches = list(SCRIPT_TAG_RE.finditer(html))
	if not matches:
		sys.exit('no <script src="js/...js"> tags found in html/index.html')
	sources = [m.group(1) for m in matches]
	bundle = '\n'.join(read(HTML_DIR / src) for src in sources)
	write(BUNDLE_JS, bundle)
	return html, matches, bundle


def inline_script(html, matches, script_body):
	start = matches[0].start()
	end = matches[-1].end()
	tag = '<script>\n' + script_body + '\n</script>\n'
	return html[:start] + tag + html[end:]


def main():
	pack = '--pack' in sys.argv[1:]
	html, matches, bundle = concat_sources()

	if not pack:
		write(OUT_HTML, inline_script(html, matches, bundle))
		size = len(bundle.encode('utf-8'))
		print(f'wrote {BUNDLE_JS} ({size} bytes, unminified)')
		print(f'wrote {OUT_HTML} (unminified sanity build)')
		print('next: minify bundle.js with an external tool, save as bundle.min.js,')
		print('then run: python html/packed/build.py --pack')
		return

	if not BUNDLE_MIN_JS.exists():
		sys.exit(f'{BUNDLE_MIN_JS} not found - minify bundle.js first (see docs/build.md)')

	final_html = inline_script(html, matches, read(BUNDLE_MIN_JS))
	write(OUT_HTML, final_html)

	DIST_ZIP.parent.mkdir(parents=True, exist_ok=True)
	with zipfile.ZipFile(DIST_ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
		z.writestr('index.html', final_html)

	size = DIST_ZIP.stat().st_size
	left = SIZE_BUDGET - size
	print(f'wrote {OUT_HTML}')
	print(f'wrote {DIST_ZIP}: {size} bytes ({left} bytes left of {SIZE_BUDGET})')
	if left < 0:
		sys.exit('OVER BUDGET')


if __name__ == '__main__':
	main()
