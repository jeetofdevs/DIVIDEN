"""Generate the AIDIVIDEND logo files: Divi with a 90/10 dividend-pie head.

Run: python3 web/assets/build_logo.py [path/to/lilita.woff2] [path/to/jetbrains-bold.woff2]
Fonts are optional; when given they are embedded so the lockup renders the same everywhere.
Outputs: logo.svg (app icon), logo-mark.svg (no background), logo-horizontal.svg (icon + wordmark).
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
  </defs>"""


def arc(cx, cy, r, start_deg, end_deg):
    """SVG arc path, angles clockwise from 12 o'clock."""
    a0, a1 = math.radians(start_deg - 90), math.radians(end_deg - 90)
    x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
    x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
    large = 1 if end_deg - start_deg > 180 else 0
    return f"M{x0:.1f},{y0:.1f} A{r},{r} 0 {large} 1 {x1:.1f},{y1:.1f}"


def sector(cx, cy, r, a0, a1, fill):
    return (f'<path d="M{cx},{cy} L{arc(cx, cy, r, a0, a1)[1:]} Z" fill="{fill}" '
            f'stroke="#16172f" stroke-width="10" stroke-linejoin="round"/>')


# Divi: the head is a dividend pie — 90% (green, holders) / 10% (orange blaze, operations).
MARK = f"""<g>
    <path d="M112,250 L140,72 Q146,58 160,66 L262,160 Z" fill="#f2b25e" stroke="#16172f" stroke-width="10" stroke-linejoin="round"/>
    <path d="M400,250 L372,72 Q366,58 352,66 L250,160 Z" fill="#f2b25e" stroke="#16172f" stroke-width="10" stroke-linejoin="round"/>
    <path d="M140,210 L156,104 L220,166 Z" fill="#e8826b"/>
    <path d="M372,210 L356,104 L292,166 Z" fill="#e8826b"/>
    {sector(256, 300, 170, 18, 342, '#8cff6a')}
    {sector(256, 300, 170, 342, 378, '#f2b25e')}
    <rect x="84" y="214" width="344" height="100" rx="50" fill="url(#dv-visor)" stroke="#16172f" stroke-width="10"/>
    <path d="M122,234 Q256,214 390,234" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="8" stroke-linecap="round"/>
    <g class="dv-eyes" filter="url(#dv-glow)" fill="#8cff6a">
      <path d="M150,290 Q190,230 230,290 Q190,270 150,290 Z"/>
      <path d="M282,290 Q322,230 362,290 Q322,270 282,290 Z"/>
    </g>
    <ellipse cx="256" cy="352" rx="22" ry="14" fill="#16172f"/>
    <path d="M256,366 V378 M222,372 Q239,394 256,378 Q273,394 290,372" fill="none" stroke="#16172f" stroke-width="8" stroke-linecap="round"/>
  </g>"""
ICON = f'<rect width="512" height="512" rx="116" fill="#22234a"/>\n  {MARK}'

WORDMARK = """<text x="560" y="286" textLength="880" lengthAdjust="spacingAndGlyphs" font-family="Lilita One, Arial Black, sans-serif" font-size="176"><tspan fill="#8cff6a">AI</tspan><tspan fill="#fff4e2">DIVIDEND</tspan></text>
  <text x="566" y="364" font-family="JetBrains Mono, Menlo, monospace" font-weight="700" font-size="40" letter-spacing="6" fill="#f2b25e">HOLD $AIDIV · EARN DIVIDENDS</text>"""


def svg(body, w, h):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
            f'  <title>AIDIVIDEND</title>\n  {fonts}\n  {DEFS}\n  {body}\n</svg>\n')


if __name__ == "__main__":
    (OUT / "logo.svg").write_text(svg(ICON, 512, 512))
    (OUT / "logo-mark.svg").write_text(svg(MARK, 512, 512))
    (OUT / "logo-horizontal.svg").write_text(svg(
        f'<rect width="1500" height="512" fill="#16172f"/>\n  <g transform="translate(40 40) scale(.84375)">{ICON}</g>\n  {WORDMARK}',
        1500, 512))
