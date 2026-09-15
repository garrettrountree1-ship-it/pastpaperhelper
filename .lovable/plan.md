# Make the PDF side canvas one page wide

## Change
- Adjust only the PDF viewer so the PDF occupies half of the editable surface at 100% zoom.
- This makes the white writing area beside it equal to one full PDF page width.
- Preserve the existing continuous drawing, highlighting, erasing, image pasting, scrolling, and zoom behavior.
- Leave PowerPoint sizing unchanged.

## Verification
- Check the PDF at 100% and zoomed sizes to confirm the side canvas is never smaller than the displayed page.
- Confirm the existing viewer controls still work and the project checks pass.

## Technical detail
- Change the PDF page fraction from 0.75 to 0.5 while retaining the current zoom-aware surface calculation.
