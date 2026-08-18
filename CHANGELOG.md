# Changelog

All notable changes to QSL will be documented here.

## [Unreleased]

## [1.0.0] — 2026-08-18

### Added
- Initial release
- `run()` function with full QSL language support
- Three-strategy selector system (label, CSS, shorthand)
- `validate()` for syntax checking
- `parse()` for tooling integration
- Two error modes: fail-fast and collect
- `onStepComplete` callback for live progress
- Automatic screenshots on failure
- Named screenshot command
- Variable system with built-in `$url`, `$base_url`, `$timestamp`
- Control flow: `if/end if` and `repeat N times/end repeat`
- Frame switching: `switch to frame` / `switch to main frame`

[Unreleased]: https://github.com/yourusername/qsl/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yourusername/qsl/releases/tag/v1.0.0
