module.exports = {
  env: {
    browser: true,
    commonjs: true,
  },
  "plugins": [
    "@typescript-eslint",
    "prettier",
    "import"
  ],
  "extends": [
    "airbnb-typescript/base",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
    "prettier"
  ],
  parserOptions: {
    ecmaVersion: 12,
    project: './tsconfig.json',
  },
  rules: {
    // Не ругаться на кривые отступы
    indent: 'off',
    // Требовать ; в конце команд
    semi: ['error', 'always'],
    // Требовать запятую у последних елементов массива (если многострочное написание)
    'comma-dangle': ['error', 'always-multiline'],
    // Предпочитать константы
    'prefer-const': 'error',
    // Требовать отсутствие пробела перед скобками у функции
    //'space-before-function-paren': ['error', 'never'],
  },
};
