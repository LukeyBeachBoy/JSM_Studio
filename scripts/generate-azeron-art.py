"""Original Cyborg top-view line art; geometry and interactive targets share a source.

Splayed, staggered finger towers and an asymmetric palm cradle follow the device's
hand-shaped silhouette. Native JSM numbering stays independent of reWASD/V2 labels.
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'JSM_GUI/jsm_gui_tauri/src'
parts, controls = [], []
body = 'var(--art-body,#1c242d)'
cap = 'var(--art-cap,#212a34)'
line = 'var(--art-line,#e3eaf1)'
detail = 'var(--art-detail,#aebbc8)'
well = 'var(--art-well,#0e1419)'
view_box = '235 12 670 716'


def path(d, fill=body, stroke=line, width=2.5, opacity=1):
    parts.append(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round" opacity="{opacity}"/>')


def key(command, x, y, w=48, h=38, label=None, rotation=None, radius=12):
    attrs = dict(x=str(x), y=str(y), width=str(w), height=str(h), rx=str(radius))
    tx, ty = x + w/2, y + h/2
    if rotation:
        angle, cx, cy = rotation
        attrs['transform'] = f'rotate({angle} {cx} {cy})'
    controls.append(dict(command=command, tag='rect', attrs=attrs))
    attributes = ' '.join(f'{name}="{value}"' for name, value in attrs.items())
    parts.append(f'<rect {attributes} fill="{cap}" stroke="{line}" stroke-width="2.5"/>')
    # Centre the numerals in each cap’s own plane so angled labels keep equal padding.
    font_size = min(20, max(17, h * .5))
    parts.append(f'<text data-button-label="{command}" x="{tx:.2f}" y="{ty:.2f}" text-anchor="middle" dominant-baseline="central" fill="{line}" font-family="system-ui,sans-serif" font-weight="500" font-size="{font_size:g}" transform="{attrs.get('transform', '')}">{label or command.removeprefix("JOY")}</text>')


# Slim independent adjustment rails, not one broad rectangular chassis.
towers = [(443, 440, 151, -39), (493, 416, 83, -20), (549, 405, 39, -2), (605, 423, 87, 19)]
for x, base, top, angle in towers:
    parts.append(f'<g transform="rotate({angle} {x} {base})">')
    path(f'M{x-15} {base+20} L{x-15} {top+19} Q{x} {top+7} {x+15} {top+19} L{x+15} {base+20} Z', well, detail, 1.8)
    path(f'M{x-6} {top+45} V{base-9} M{x+6} {top+45} V{base-9}', 'none', detail, 1, .55)
    for y in (top+64, base-24):
        parts.append(f'<circle cx="{x}" cy="{y}" r="4" fill="{body}" stroke="{detail}" stroke-width="1.5"/>')
    # Raised lip above the distal flick key.
    path(f'M{x-10} {top+4} V{top-7} Q{x} {top-13} {x+10} {top-7} V{top+4}', well, detail, 1.8)
    parts.append('</g>')

# Thumb support is articulated away from the palm, with a separate lower arm.
path('M606 462 L674 392 Q684 384 694 391 L723 410 L685 469 L645 493 Z', well, detail, 2)
path('M682 441 L751 478 L843 532 L826 557 L731 505 L668 476 Z', body, detail, 2)
path('M697 458 L824 535', 'none', detail, 1.2, .65)
parts.append(f'<circle cx="684" cy="451" r="10" fill="{well}" stroke="{detail}" stroke-width="2"/>')
parts.append(f'<circle cx="684" cy="451" r="3" fill="{detail}"/>')

# Five physical controls on each finger tower, preserving the native map.
middle_row_centres = []
for col, (x, base, top, angle) in enumerate(towers):
    travel = base - top - 48
    levels = [top, top+travel*.29, top+travel*.49, top+travel*.69, top+travel*.87]
    middle_row_centres.append(round(levels[2], 2) + 37/2)
    ids = [14+col, 10+col, 6+col, 1+col, (24, 26, 18, 19)[col]]
    for index, (number, y) in enumerate(zip(ids, levels)):
        key(f'JOY{number}', x-24, round(y, 2), h=51 if index == 0 else 37 if index < 4 else 30,
            rotation=(angle, x, base), radius=14 if index == 0 else 12)
# Lateral keys share the third row with 6–9, in each splayed tower's plane.
key('JOY23', 374, round(middle_row_centres[0] - 33/2, 2), 42, 33, rotation=(-39,443,440), radius=10)
key('JOY5', 637, round(middle_row_centres[3] - 34/2, 2), 43, 34, rotation=(19,605,423), radius=10)

# Asymmetric, long palm cradle with a low perimeter rim and restrained contours.
path('M421 431 C448 407 522 390 586 399 C610 402 621 414 620 438 C619 460 634 483 637 511 C644 575 614 651 567 687 C538 711 492 718 467 696 C430 664 414 613 410 557 C406 515 413 478 418 454 Q412 439 421 431 Z', well, detail, 2)
path('M425 425 C457 402 526 387 587 396 C608 399 616 411 613 432 C609 454 626 483 629 513 C635 572 608 642 563 677 C534 700 497 707 473 686 C441 657 423 607 420 555 C416 514 421 474 425 452 Q417 435 425 425 Z', body, line, 3)
path('M440 440 C470 421 531 409 584 415 M481 665 C505 680 535 674 554 658', 'none', detail, 1.5, .65)
path('M592 453 C562 492 553 558 561 605', 'none', detail, 1.2, .3)
parts.append(f'<text x="514" y="619" text-anchor="middle" fill="{detail}" font-family="system-ui,sans-serif" font-weight="500" font-size="12" letter-spacing="3.5" opacity=".8">CYBORG</text>')

# Side elevation of the angled thumb module: the 5-way knob sits above
# the stick, and the two thumb keys share one short diagonal tower below it.
path('M691 453 L706 338 Q710 330 722 334 L749 346 L765 387 L736 476 L708 468 Z', body, line, 2.5)
path('M699 447 L719 361 L733 367 M710 456 L730 464', 'none', detail, 1.4)
# One physical five-way nub: a short barrel with a rounded end face,
# protruding from its socket. Its directions share this single image target.
nub_transform = 'translate(737 343) rotate(18)'
nub_shape = 'M-25 -14 H16 C28 -14 28 14 16 14 H-25 C-33 14 -33 -14 -25 -14 Z'
parts.append(f'<g data-five-way-nub="true" transform="{nub_transform}">')
path('M-31 -18 C-40 -18 -40 18 -31 18 L-25 14 V-14 Z', well, detail, 1.8)
path(nub_shape, cap, line, 2.5)
parts.append(f'<ellipse cx="16" cy="0" rx="9" ry="14" fill="{cap}" stroke="{line}" stroke-width="1.5"/>')
path('M-23 -9 H6', 'none', detail, 1.1, .55)
parts.append('</g>')
controls.append(dict(command='JOY20', tag='path', attrs=dict(d=nub_shape, transform=nub_transform)))
# Centre the upright number on the usable barrel surface, away from its seam.
parts.append(f'<text data-button-label="JOY20" x="728.44" y="340.22" text-anchor="middle" dominant-baseline="central" fill="{line}" font-family="system-ui,sans-serif" font-size="16">20</text>')
# The analog stick stays circular in the editor, including its click target,
# selection ring and live travel; no perspective squash is applied.
for radius, fill, stroke, width in [(48, well, detail, 2), (40, cap, line, 2.5), (30, 'none', detail, 1.2)]:
    parts.append(f'<circle data-analog-cap="{radius}" cx="745" cy="423" r="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')
controls.append(dict(command='JOY21', tag='circle', attrs=dict(cx='745',cy='423',r='28')))
parts.append(f'<text data-button-label="JOY21" x="745" y="423" text-anchor="middle" dominant-baseline="central" fill="{line}" font-family="system-ui,sans-serif" font-size="18">21</text>')
# Both thumb keys sit together along the real tower, beyond the stick.
path('M730 459 L838 522 L824 547 L716 484 Z', body, detail, 2)
path('M742 473 L825 522', 'none', detail, 1.2)
key('JOY25', 744, 476, 46, 34, rotation=(32,767,493), radius=9)
key('JOY22', 792, 509, 46, 34, rotation=(32,815,526), radius=9)

front = ''.join(parts)
model = dict(name='Azeron Cyborg', viewBox=view_box, front=front, back='', controls=controls, backControls=[], sticks=[[745,423,40]])
file = root/'components/controllerModels.json'
models = json.loads(file.read_text(encoding='utf-8'))
models['azeron-cyborg'] = model
file.write_text(json.dumps(models, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
(root/'assets/controllers/azeron-cyborg-front.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}">{front}</svg>\n', encoding='utf-8')
