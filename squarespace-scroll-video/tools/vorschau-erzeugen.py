#!/usr/bin/env python3
"""Erzeugt vorschau.html aus squarespace-code-block.html.
Aufruf aus dem Ordner squarespace-scroll-video:  python3 tools/vorschau-erzeugen.py ."""
import sys, pathlib
d = pathlib.Path(sys.argv[1])
snippet = (d / "squarespace-code-block.html").read_text().replace('"/s/', '"media/')
page = """<!doctype html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scroll-Video Vorschau</title>
<!-- Lokale Vorschau: bildet eine Squarespace-7.1-Seite nach (Header, Sektion, Fluid-Engine-Block).
     Neu erzeugen nach Änderungen am Code-Block: siehe ANLEITUNG.md -->
<style>
  body { margin: 0; background: #fff; font-family: Helvetica, Arial, sans-serif; color: #222; }
  h1, h2, h3, p { white-space: pre-wrap; font-family: Helvetica, Arial, sans-serif; }
  p { font-size: 18px; line-height: 1.8; }
  a { color: #0645ad; text-decoration: underline; }
  .header { position: fixed; z-index: 1000; top: 0; left: 0; right: 0; display: flex; justify-content: space-between;
            align-items: center; padding: 22px 4vw; color: #fff; mix-blend-mode: difference; }
  .header b { letter-spacing: .3em; font-size: 14px; }
  .header nav { display: flex; gap: 28px; font-size: 13px; letter-spacing: .1em; }
  .page-section { position: relative; }
  .content-wrapper { max-width: 1200px; margin: 0 auto; padding: 6vw 4vw; overflow: hidden; }
  .fluid-engine { display: grid; grid-template-columns: repeat(24, 1fr); }
  .fe-block { grid-column: 2 / 24; overflow: hidden; }
  footer { padding: 60px 4vw; background: #111; color: #aaa; font-size: 13px; }
</style>
</head>
<body>
<header class="header"><b>IHRE MARKE</b><nav><span>Kaufen</span><span>Verkaufen</span><span>Kontakt</span></nav></header>
<main><article class="sections" id="sections">
<section class="page-section"><div class="content-wrapper"><div class="fluid-engine"><div class="fe-block"><div class="sqs-block code-block sqs-block-code"><div class="sqs-block-content">
""" + snippet + """
</div></div></div></div></div></section>
<section class="page-section"><footer>Squarespace-Footer · Vorschau</footer></section>
</article></main>
</body>
</html>
"""
(d / "vorschau.html").write_text(page)
print("ok", len(page))
