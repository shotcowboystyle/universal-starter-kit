/** Web overlays use the browser viewport; native overlays measure the keyboard band. */
export const useKeyboardInset = (): number => {
  return 0;
};
