# @stratamu/base

`Base`, an abstract class that gives an object a lazily created, contextual logger.

**Status:** small and settled. Private and unpublished.

## What exists

- `Base`: a protected `log` getter, created on first use as a child of the shared root logger with a `component` binding set to the class name.

## Not yet

- Anything beyond logging. Capabilities that objects should share are added when a second user needs them.

## Depends on

`@stratamu/capabilities` for `LoggingCapability` and `createContextLogger`.

## Note

The README on `main` describes an earlier package with the same purpose and a different design. It does not describe this one.
