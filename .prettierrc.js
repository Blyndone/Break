module.exports = {
  trailingComma: "all",
  tabWidth: 2,
  semi: false,
  singleQuote: true,
  printWidth: 100,
  useTabs: false,
  bracketSpacing: true,
  endOfLine: "lf",
  arrowParens: "always",
  // IMPORTANT PART BELLOW

  overrides: [
    {
      files: "**/*.{hbs}",
      options: {
        parser: "glimmer"
      }
    }
  ]
};
