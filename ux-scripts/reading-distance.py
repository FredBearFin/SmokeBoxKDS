# Converts a text size in CSS pixels to physical size and reading distance for a screen.
# Assumptions (mine, stated so they can be checked): cap height is 0.72 x font size; comfortable reading needs the cap height to
# subtend 0.4 degrees (about 11.9 feet per inch of cap height); barely legible is 0.2 degrees (about 23.9 feet per inch).
import math
screens = {'10.1in tablet 1280x800': (1280, 800, 10.1), '24in monitor 1920x1080': (1920, 1080, 24),
           '32in TV 1920x1080': (1920, 1080, 32), '43in TV 1920x1080': (1920, 1080, 43)}
# measured font sizes in px on the board (tablet 1280 wide, large screens 1920 wide)
tablet = [('ticket number', 24.5), ('timer', 22.0), ('item or customer name', 16.0), ('next-action line', 12.5), ('status chip', 12.5)]
large = [('ticket number', 30.7), ('timer', 27.6), ('item or customer name', 19.2), ('next-action line', 15.0), ('status chip', 15.0)]
for name, (w, h, d) in screens.items():
    ppi = math.hypot(w, h) / d
    print(f'\n{name}: {ppi:.0f} px per inch')
    for label, px in (tablet if w == 1280 else large):
        cap_in = 0.72 * px / ppi
        print(f'  {label:24s} {px:5.1f}px  comfortable to {cap_in*11.9:4.1f} ft, barely legible to {cap_in*23.9:4.1f} ft')
