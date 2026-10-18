# Shrinks and blurs a screenshot to imitate viewing it from farther away. Usage: python3 distance-sim.py in.png out.png 0.5
import sys
from PIL import Image, ImageFilter
src, dst, scale = sys.argv[1], sys.argv[2], float(sys.argv[3])
im = Image.open(src).convert('RGB')
small = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.7))
small.save(dst)
