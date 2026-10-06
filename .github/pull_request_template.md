## Description

<!-- What does this PR change, and why? -->

## Related issue

<!-- e.g. Fixes #7 — or "none" -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Improvement (performance)
- [ ] Security
- [ ] Documentation
- [ ] Refactor / code quality
- [ ] CI / repository
- [ ] Breaking change — existing installations must act after updating

## How was this tested?

<!--
Which Home Assistant and BamBuddy version, which printer model?
Never try the print controls on a printer that is printing.
-->

## Checklist

- [ ] Tested on a real Home Assistant instance, if the change affects the running integration
- [ ] Uses only Home Assistant APIs that exist in 2025.1, the supported floor (CONTRIBUTING → Things that are easy to get wrong)
- [ ] Commit messages follow Conventional Commits
- [ ] Translations updated and in sync, if UI strings changed: `strings.json` and both `translations/*.json` (`en`, `de`)
- [ ] No API key, camera token or other secret is logged or committed
- [ ] README updated, if user-facing behavior changed

<!--
A pull request to dev or main is validated by CI: hassfest and HACS validation.
Do NOT bump the version in manifest.json — the release workflow sets it.
-->
