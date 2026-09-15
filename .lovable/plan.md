# Enlarge side canvas and improve document zoom

## Changes
- Make the white writing area beside a PDF at least as wide as the displayed PDF page.
- Leave the current PowerPoint side-canvas proportion unchanged.
- Keep mousepad and touchscreen pinch zoom anchored beneath the fingers or pointer, instead of pulling the view toward the left edge.
- Keep horizontal and vertical scrolling available while enlarged so every part of PDFs, documents, and slides can be reached.
- Preserve drawing, highlighting, erasing, image pasting, and one-finger scrolling.

## Verification
- Check PDFs at 100% and enlarged sizes for a full-page-width side canvas and visible horizontal travel.
- Check PDF and document/slide viewers by zooming over the center and right side, then scrolling to every edge.
- Confirm drawing and editing controls remain usable.

## Technical detail
- Set the PDF page fraction to 0.5.
- Correct anchor calculations against the viewer's actual content-size change and make overflow behavior explicit in both viewers.
