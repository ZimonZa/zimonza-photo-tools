/**
 * Phones (below `lg`): put on a container so every button, link, text field and select inside is at
 * least 44 px tall to tap. Switches are left alone (their label is the target, see `QualitySwitch`),
 * and so are controls that set their own min height. Range sliders get a 44 px tall hit band with
 * the same thin track painted in its middle. Computers keep the controls' own sizes.
 */
export const PHONE_TOUCH = [
  "max-lg:[&_button:not([role=switch]):not([class*=min-h-])]:min-h-11",
  "max-lg:[&_a[href]]:min-h-11",
  "max-lg:[&_input:not([type=range])]:min-h-11",
  "max-lg:[&_select]:min-h-11",
  "max-lg:[&_input[type=range]]:h-11",
  "max-lg:[&_input[type=range]]:py-[19px]",
  "max-lg:[&_input[type=range]]:!bg-clip-content",
].join(" ");
