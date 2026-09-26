/**
 * After a submit that failed validation, moves focus to the first field
 * marked `aria-invalid="true"` so keyboard and screen reader users land on
 * the error. Waits a frame for the error state to render.
 */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  if (!form) return;
  requestAnimationFrame(() => {
    form
      .querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  });
}
