// App is designed for light mode only — always return 'light' regardless of system setting
export function useColorScheme(): 'light' | 'dark' {
  return 'light';
}
