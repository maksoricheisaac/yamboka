/**
 * Conventional Commits : type(portée facultative): description.
 * Types acceptés : feat, fix, docs, style, refactor, test, chore, perf, build, ci, revert.
 * Les messages de fusion (« Merge … ») sont ignorés par défaut.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Les corps de message sont rédigés en français, avec de longues phrases : seule la première ligne est limitée.
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
