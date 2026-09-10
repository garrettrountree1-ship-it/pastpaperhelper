# Individual answer-release overrides

## What will change
- Make each student’s two answer-release choices inherit the whole-class choice until individually changed.
- Keep inherited choices visibly checked when the whole-class choice is on.
- Allow either student checkbox to be unchecked, overriding the whole-class setting for that student only.
- Allow a student override to be switched on even when the whole-class setting is off.

## Data behavior
- Store three states for each student setting: inherit, on, or off.
- Convert existing unselected student values to “inherit,” preserving current behavior.
- Resolve student access by using the individual value when present; otherwise use the whole-class value.

## Verification
- Check class on + student inherited, class on + student off, class off + student on, and class off + student inherited.
- Run the project checks after updating the controls and saved settings.
