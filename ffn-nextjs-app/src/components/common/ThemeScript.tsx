export function ThemeScript() {
  const themeScript = `
    (function() {
      try {
        var theme = localStorage.getItem('theme') || 'system';
        var resolvedTheme = theme;
        
        if (theme === 'system') {
          resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(resolvedTheme);
      } catch (e) {
        console.warn('Failed to set initial theme');
      }
    })();
  `;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: themeScript }}
    />
  );
}