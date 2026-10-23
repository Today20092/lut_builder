# Versioning and releases

This is the canonical version and readiness policy. Integration and promotion
follow [the Git workflow](branch-workflow.md).

## Version sources and current status

`project.version` in [pyproject.toml](../pyproject.toml) is the application/package
version authority. The project entry in `uv.lock` must agree. The private
[frontend package](../frontend/package.json) has a tooling version, currently
`0.0.1`; it is not an independent product release and need not match Python.
Setup JSON and browser-storage schema versions identify data formats, not
application releases.

At policy setup on 2026-10-23, the source package version is `0.1.0`; no remote
version tags or GitHub Releases were found. The Pages website is continuously
deployed from `main` and must be identified by its deployment/source revision
when no versioned release exists. A deployed website is not evidence of a
published Python package.

**Next accepted release target: not selected.** This policy does not change the
package version or declare 1.0 readiness. Record an owner-accepted target and its
readiness separately from the currently published version before preparing a
release. No existing package-index publication was verified during setup.

## Compatibility contract

Compatibility covers the documented Python CLI and local workspace, browser
editing/export workflows, supported camera interpretations, portable setups,
saved palettes/setups and preferences, imported looks, and `.cube` exports.
The Python baseline is the `requires-python` constraint in `pyproject.toml`;
browser and media support claims must match the guides and verification evidence.
Internal Python and TypeScript implementation symbols are not a promised library
API.

- Newer releases preserve supported older setups and user-authored values, or
  provide an explicit migration/recovery path. Preserve imported cube identity
  and interpretation; never silently replace a missing or invalid look. See
  [imported LUT persistence](imported-lut-composition.md#preview-verification-and-persistence).
- This is forward migration of older data into newer applications, not a promise
  that older applications can open newer data formats. Unsupported formats fail
  visibly without discarding the user's original data.
- Preserve documented CLI commands/options, accepted configurations, exit/error
  behavior and machine-consumed output contracts. Diagnostic wording and visual
  refinements can change when workflows and data remain usable.
- Preserve documented cube structure, sizes, input/output interpretations, range
  conventions and diagnostic semantics. Correcting an algorithm or profile may
  change calculated samples without breaking compatibility when the documented
  interpretation and authored settings remain usable. Explain consequential
  numerical changes and provide source evidence and regression coverage under
  [Contributing.md](../Contributing.md).
- Browser-local storage remains tied to its origin. Preserve or explicitly
  migrate supported storage where feasible; an origin/storage change needs an
  export/recovery route and clear instructions. Browser storage alone is not a
  portable backup.

## Select the increment

Use [Semantic Versioning 2.0.0](https://semver.org/) against this contract and
choose the highest required increment across the release batch.

| Change | At/after 1.0 | During 0.y.z |
| --- | --- | --- |
| Compatible fix or small UI refinement | Patch | Patch |
| Compatible functionality, including new UI features | Minor; reset patch | Minor; reset patch |
| Breaking contract change | Major; reset minor/patch | Minor; reset patch, with explicit breaking-change and migration notes |

The pre-1.0 column is this project's convention, not a SemVer compatibility
guarantee. Documentation-only work can accompany the next release without a
version bump. Internal refactoring is compatible when observable contracts and
safe data migration are preserved. Released contents are immutable; changed
release contents receive a new version.

## Readiness

- **Alpha** (`-alpha.N`): incomplete or experimental core behavior.
- **Beta** (`-beta.N`): intended workflows are ready for broader testing, with
  confidence still developing.
- **Release candidate** (`-rc.N`): proposed stable release awaiting final checks.
- **Stable** (no suffix): recommended and maintained for the documented purpose,
  with known limitations stated.

Stages are optional. Move to `1.0.0` when the owner accepts maintaining this
contract and the documented purpose is ready for recommended use. UI polish
alone does not block that decision. The existing unsuffixed `0.1.0` metadata
does not establish a stable 1.0 contract.

Use SemVer spelling for release labels/tags. Python package metadata uses the
[Python prerelease convention](https://packaging.python.org/en/latest/specifications/version-specifiers/#pre-releases)
and the
corresponding packaging spelling (`1.0.0a1`, `1.0.0b1`, `1.0.0rc1` for
`1.0.0-alpha.1`, `1.0.0-beta.1`, `1.0.0-rc.1`); record both identities when
preparing a prerelease.

Readiness applies only to advertised workflows and environments. Separate
automated build/test evidence from real browser, phone, camera and monitor use.
The [mobile release report](testing/mobile-release-2026-10-23.md) records limits
on physical-device testing; it does not certify every supported platform.

## Prepare and publish

1. Select a reviewed development commit and an unused version under the rules
   above. Update `pyproject.toml`, run `uv lock`, and check the project entry in
   `uv.lock`. Inspect release automation for stale versions, notes and channel
   flags. Done: source, lockfile and intended release identity agree.
2. Write release notes identifying the source SHA, changes, compatibility and
   recovery steps, known limitations and intended readiness. Align current
   README/manual/help/download wording; preserve historical release records.
   Done: the current product claims match the candidate and its evidence.
3. Run the [required source checks](../AGENTS.md) on integrated source, including
   the relevant [UI](testing/ui-quality.md), browser and media acceptance. For
   package distribution, run `uv build` and smoke-test the produced wheel in a
   clean environment with `lut-builder --help`, `lut-builder list`, workspace
   startup and bundled assets. Done: the release record names source/artifact
   hashes, actual results, environments and skipped checks.
4. Promote through the reviewed `development` → `main` route when authorized.
   That merge deploys Pages after CI; verify the deployed editor and manual.
   Version tagging, GitHub Release creation and package publication are separate
   authorized actions. No packaging/publication workflow currently automates
   them. Done: the record distinguishes preparation, promotion and publication.
5. After authorized publication, check the public version, release flags and
   downloads, retaining the exact tested artifacts and hashes. Bring main-only
   release metadata back into development. Done: public contents match the
   tested release and development includes the published source.
