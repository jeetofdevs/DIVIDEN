"""Generate the AIDIVIDEND logo files (vector Divi + $AI dividend coin).

Run: python3 web/assets/build_logo.py [path/to/lilita.woff2] [path/to/jetbrains-bold.woff2]
Fonts are optional; when given they are embedded so the SVGs render the same everywhere.
"""
import base64
import math
import sys
from pathlib import Path

OUT = Path(__file__).parent


def font_face(family, path, weight=400):
    data = base64.b64encode(Path(path).read_bytes()).decode()
    return f'@font-face{{font-family:"{family}";font-weight:{weight};src:url(data:font/woff2;base64,{data}) format("woff2");}}'


fonts = ""
if len(sys.argv) > 2:
    fonts = "<style>" + font_face("Lilita One", sys.argv[1]) + font_face("JetBrains Mono", sys.argv[2], 700) + "</style>"

DEFS = """<defs>
    <filter id="dv-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="dv-visor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a3a5c"/><stop offset="1" stop-color="#0b0c1c"/>
    </linearGradient>
    <radialGradient id="dv-gold" cx="38%" cy="32%" r="75%">
      <stop offset="0" stop-color="#ffe7a8"/><stop offset=".6" stop-color="#f2b25e"/><stop offset="1" stop-color="#c3752a"/>
    </radialGradient>
  </defs>"""


def arc(cx, cy, r, start_deg, end_deg):
    """SVG arc path, angles clockwise from 12 o'clock."""
    a0, a1 = math.radians(start_deg - 90), math.radians(end_deg - 90)
    x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
    x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
    large = 1 if end_deg - start_deg > 180 else 0
    return f"M{x0:.1f},{y0:.1f} A{r},{r} 0 {large} 1 {x1:.1f},{y1:.1f}"


HEAD = """<g stroke-linejoin="round">
    <path d="M112,250 L140,72 Q146,58 160,66 L262,160 Z" fill="#f2b25e" stroke="#16172f" stroke-width="10"/>
    <path d="M400,250 L372,72 Q366,58 352,66 L250,160 Z" fill="#f2b25e" stroke="#16172f" stroke-width="10"/>
    <path d="M140,210 L156,104 L220,166 Z" fill="#e8826b"/>
    <path d="M372,210 L356,104 L292,166 Z" fill="#e8826b"/>
    <path d="M96,300 C96,190 170,140 256,140 C342,140 416,190 416,300 C416,392 346,440 256,440 C166,440 96,392 96,300 Z" fill="#f2b25e" stroke="#16172f" stroke-width="10"/>
    <path d="M110,330 C140,300 200,300 256,318 C312,300 372,300 402,330 C392,400 330,432 256,432 C182,432 120,400 110,330 Z" fill="#fff4e2"/>
    <rect x="84" y="206" width="344" height="100" rx="50" fill="url(#dv-visor)" stroke="#16172f" stroke-width="10"/>
    <path d="M122,226 Q256,206 390,226" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="8" stroke-linecap="round"/>
    <g class="dv-eyes" filter="url(#dv-glow)" fill="#8cff6a">
      <path d="M150,282 Q190,222 230,282 Q190,262 150,282 Z"/>
      <path d="M282,282 Q322,222 362,282 Q322,262 282,282 Z"/>
    </g>
    <ellipse cx="256" cy="336" rx="20" ry="13" fill="#16172f"/>
    <path d="M256,349 V356" stroke="#16172f" stroke-width="7" stroke-linecap="round"/>
  </g>"""

# $AI coin with a 90 / 10 dividend ring, held in Divi's mouth
CX, CY = 256, 404
COIN = f"""<g>
    <circle cx="{CX}" cy="{CY}" r="98" fill="#16172f"/>
    <path d="{arc(CX, CY, 88, 4, 320)}" fill="none" stroke="#8cff6a" stroke-width="14" stroke-linecap="round"/>
    <path d="{arc(CX, CY, 88, 332, 356)}" fill="none" stroke="#f2b25e" stroke-width="14" stroke-linecap="round"/>
    <circle cx="{CX}" cy="{CY}" r="72" fill="url(#dv-gold)" stroke="#16172f" stroke-width="8"/>
    <circle cx="{CX}" cy="{CY}" r="58" fill="none" stroke="#8a5320" stroke-width="3" opacity=".5"/>
    <text x="{CX}" y="{CY + 19}" text-anchor="middle" font-family="Lilita One, Arial Black, sans-serif" font-size="54" letter-spacing="1" fill="#16172f">$AI</text>
  </g>"""

MARK = f'<g transform="translate(0 -30)">{HEAD}</g>\n  {COIN}'
ICON = f'<rect width="512" height="512" rx="116" fill="#22234a"/>\n  {MARK}'


def svg(body, w, h):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
            f'  <title>AIDIVIDEND</title>\n  {fonts}\n  {DEFS}\n  {body}\n</svg>\n')


WORDMARK = """<text x="560" y="286" textLength="880" lengthAdjust="spacingAndGlyphs" font-family="Lilita One, Arial Black, sans-serif" font-size="176"><tspan fill="#8cff6a">AI</tspan><tspan fill="#fff4e2">DIVIDEND</tspan></text>
  <text x="566" y="364" font-family="JetBrains Mono, Menlo, monospace" font-weight="700" font-size="40" letter-spacing="6" fill="#f2b25e">HOLD $AIDIV · EARN $AI</text>"""

(OUT / "logo.svg").write_text(svg(ICON, 512, 512))
(OUT / "logo-mark.svg").write_text(svg(MARK, 512, 512))
(OUT / "logo-horizontal.svg").write_text(svg(
    f'<rect width="1500" height="512" fill="#16172f"/>\n  <g transform="translate(40 40) scale(.84375)">{ICON}</g>\n  {WORDMARK}', 1500, 512))
# Inline fragment for the website (no fonts: the page loads them)
(OUT / "logo-inline.html").write_text(f"{DEFS}\n  {ICON}\n")
