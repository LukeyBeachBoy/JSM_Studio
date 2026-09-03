#!/usr/bin/env python3
"""Guards that the Steam Controller overlay stays locked to its artwork.

The overlay drifted once already: ControllerStatusSvg used a 1117x750 viewBox
while steam-controller-front.svg was authored at 439x319, so preserveAspectRatio
silently fit the artwork to height and offset it ~42 units right. Every overlay
coordinate was then wrong, and hand-tuning individual values could only ever be
right near the middle of the image.

Run: python3 tests/overlay_alignment.py     (no dependencies)
"""
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parents[1]
GUI = ROOT / 'JSM_GUI/jsm_gui_tauri/src'
ART = GUI / 'assets/steam-controller-front.svg'
TSX = GUI / 'components/ControllerStatusSvg.tsx'

art = ART.read_text(encoding='utf-8')
tsx = TSX.read_text(encoding='utf-8')
# The Steam Controller branch only; the file also holds a legacy DualSense layout.
steam = tsx.split('viewBox="0 0 1117 750"', 1)[1].split('// --- Legacy layout', 1)[0]

NUM = r'-?\d+(?:\.\d+)?'


def artwork_shapes():
    """Bounding box of every path, in overlay coordinates.

    A cubic bezier is contained by the convex hull of its control points, so the
    control-point bbox bounds the real shape and slightly overestimates it. That
    is accurate enough to catch a misplaced overlay without pulling in a bezier
    library, and it is why the tolerances below are generous.

    The largest path is the body outline; it contains everything, so it is
    excluded from feature matching.
    """
    sx = sy = 1.0
    tx = 0.0
    g = re.search(r'<g transform="translate\((%s)\s+(%s)\)\s*scale\((%s)\)"' % (NUM, NUM, NUM), art)
    if g:
        tx, sx = float(g.group(1)), float(g.group(3))
        sy = sx
    shapes = []
    for d in re.findall(r'<path d="([^"]+)"', art):
        nums = [float(n) for n in re.findall(NUM, d)]
        xs = [nums[i] * sx + tx for i in range(0, len(nums) - 1, 2)]
        ys = [nums[i] * sy for i in range(1, len(nums), 2)]
        if not xs:
            continue
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        shapes.append({
            'cx': (x0 + x1) / 2, 'cy': (y0 + y1) / 2,
            'x0': x0, 'x1': x1, 'y0': y0, 'y1': y1,
            'area': (x1 - x0) * (y1 - y0),
        })
    body = max(shapes, key=lambda s: s['area'])
    return [s for s in shapes if s is not body]


SHAPES = artwork_shapes()


def nearest(cx, cy):
    return min(SHAPES, key=lambda s: math.hypot(s['cx'] - cx, s['cy'] - cy))


def covering(cx, cy):
    """Artwork features whose bounding box contains this point."""
    return [s for s in SHAPES
            if s['x0'] <= cx <= s['x1'] and s['y0'] <= cy <= s['y1']]


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def test_overlay_and_artwork_share_a_coordinate_space():
    """The original bug. If these ever diverge again, every overlay is wrong."""
    m = re.search(r'<svg[^>]*viewBox="0 0 (%s) (%s)"' % (NUM, NUM), art)
    check(m is not None, 'artwork has no viewBox')
    check(m.group(1) == '1117' and m.group(2) == '750',
          f'artwork viewBox is {m.group(1)}x{m.group(2)}, overlay space is 1117x750')
    img = re.search(r'<image[^>]*width="(%s)"[^>]*height="(%s)"' % (NUM, NUM), steam)
    check(img is not None, 'no <image> in the Steam layout')
    check(img.group(1) == '1117' and img.group(2) == '750',
          'the artwork <image> must fill the overlay viewBox exactly')


def test_every_overlay_anchor_sits_on_an_artwork_feature():
    anchors = []
    for m in re.finditer(r'<Stick cx=\{(%s)\} cy=\{(%s)\}' % (NUM, NUM), steam):
        anchors.append(('stick', float(m.group(1)), float(m.group(2))))
    for m in re.finditer(r'<ButtonBubble\s+cx=\{(%s)\}\s+cy=\{(%s)\}(.*?)/>' % (NUM, NUM), steam, re.S):
        t = re.search(r'title="([^"]+)"', m.group(3))
        anchors.append((t.group(1) if t else 'button', float(m.group(1)), float(m.group(2))))
    check(len(anchors) >= 14, f'expected the full Steam face layout, found {len(anchors)} anchors')
    matched = {}
    for name, cx, cy in anchors:
        # Every anchor must land on an actual drawn feature. A multi-lobe path
        # (the D-pad is one path for all four directions) is matched by
        # containment rather than by centre distance.
        hits = covering(cx, cy)
        check(hits, f'{name} at ({cx},{cy}) does not sit on any artwork feature')
        best = min(hits, key=lambda s: math.hypot(s['cx'] - cx, s['cy'] - cy))
        matched.setdefault((best['cx'], best['cy']), []).append(name)

    # Containment alone would accept an overlay parked on the wrong feature, so
    # require distinct controls to claim distinct artwork features. The D-pad is
    # the sole exception: all four directions are drawn as a single path.
    shared = {k: v for k, v in matched.items() if len(v) > 1}
    check(len(shared) <= 1, f'overlays are stacked on the same artwork feature: {shared}')
    for names in shared.values():
        check(all('D-pad' in n for n in names),
              f'these controls all claim one artwork feature: {names}')


def test_trackpad_overlays_match_the_artwork_pads():
    block = re.search(r'const STEAM_PAD = \{(.*?)\} as const', tsx, re.S).group(1)
    pads = dict(re.findall(r'(left|right):\s*\{([^}]*)\}', block))
    check(set(pads) == {'left', 'right'}, 'both pads must be declared')
    for side, body in pads.items():
        v = dict((k, float(n)) for k, n in re.findall(r'(\w+):\s*(%s)' % NUM, body))
        s = nearest(v['cx'], v['cy'])
        off = math.hypot(s['cx'] - v['cx'], s['cy'] - v['cy'])
        check(off <= 8, f'{side} pad centre ({v["cx"]},{v["cy"]}) is {off:.1f} units '
                        f'from the artwork pad centre ({s["cx"]:.1f},{s["cy"]:.1f})')
        # The pads are square; a half-extent taken from a 2:1 DS4 box would fail here.
        w, h = s['x1'] - s['x0'], s['y1'] - s['y0']
        check(abs(w - h) / max(w, h) < 0.05, f'{side} artwork pad is not square ({w:.0f}x{h:.0f})')
        check(abs(v['half'] * 2 - w) / w < 0.15,
              f'{side} pad half-extent {v["half"]} does not match artwork width {w:.0f}')
        check(abs(v['rot']) > 5, f'{side} pad is tilted in the artwork but rot={v["rot"]}')
    check('padPoint(' in tsx, 'the live touch dot must be rotated into pad space')


def test_pads_and_sticks_are_not_swapped():
    """A merge once landed the pad overlays on the stick features and vice versa.
    Both sit on the vertical centre line of their half of the controller, so a
    nearest-feature check alone can miss it -- but the trackpads are by far the
    largest circular features on the face, and the sticks are the ones with a
    surrounding well. Assert the sizes, not just the positions."""
    pad_block = re.search(r'const STEAM_PAD = \{(.*?)\} as const', tsx, re.S).group(1)
    pads = dict(re.findall(r'(left|right):\s*\{([^}]*)\}', pad_block))
    sticks = [(float(x), float(y)) for x, y in re.findall(r'<Stick cx=\{(%s)\} cy=\{(%s)\}' % (NUM, NUM), steam)]
    check(len(sticks) == 2, f'expected two sticks in the Steam layout, found {len(sticks)}')

    def width_at(cx, cy):
        s = nearest(cx, cy)
        return s['x1'] - s['x0']

    pad_widths = [width_at(*(float(dict(re.findall(r'(\w+):\s*(%s)' % NUM, body))[k]) for k in ('cx', 'cy')))
                  for body in pads.values()]
    stick_widths = [width_at(cx, cy) for cx, cy in sticks]
    check(min(pad_widths) > max(stick_widths) * 1.4,
          f'pad overlays sit on features {min(pad_widths):.0f} units wide but stick overlays sit on '
          f'{max(stick_widths):.0f}-unit features -- the trackpads are the larger circles, so these look swapped')


def test_steam_layout_does_not_reuse_dualsense_geometry():
    """The shoulder overlays were left on DualSense paths, which drew across the
    D-pad and face buttons and swallowed their clicks."""
    check('DUALSENSE_PATHS' not in steam,
          'the Steam layout must not position overlays with DUALSENSE_PATHS')
    check('shoulderTrigger(' in steam and 'shoulderBumper(' in steam,
          'shoulder overlays must use the measured STEAM_SHOULDER geometry')


def test_shoulder_overlays_clear_the_face_controls():
    band = re.search(r'const SHOULDER_BUMPER_Y = (%s)' % NUM, tsx)
    height = re.search(r'const SHOULDER_BUMPER_H = (%s)' % NUM, tsx)
    check(band and height, 'shoulder band constants missing')
    bottom = float(band.group(1)) + float(height.group(1))
    tops = []
    for m in re.finditer(r'<ButtonBubble\s+cx=\{%s\}\s+cy=\{(%s)\}(.*?)/>' % (NUM, NUM), steam, re.S):
        r = re.search(r'radius=\{(%s)\}' % NUM, m.group(2))
        tops.append(float(m.group(1)) - (float(r.group(1)) if r else 20))
    check(min(tops) >= bottom,
          f'shoulder band reaches y={bottom} but a face control starts at y={min(tops)}')


if __name__ == '__main__':
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith('test_'):
            try:
                fn()
                print(f'PASS {name}')
            except AssertionError as exc:
                failures += 1
                print(f'FAIL {name}: {exc}')
    sys.exit(1 if failures else 0)
