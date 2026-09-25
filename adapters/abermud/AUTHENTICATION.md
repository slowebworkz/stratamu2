# AberMUD authentication boundary

## Historical status

David Kinder's AberMUD2 reconstruction documents starting the game, logging on as `debugger`, setting a password, and entering the game. The reconstruction is based on an early public archive whose contents were incomplete and repaired with material from a later Rich Salz release.

The exact historical `user_file` record layout and password implementation are **not established by the source currently available to Stratamu**. This repository therefore does not claim that its account file format or password derivation reproduces historical `user_file` bytes.

## Current Stratamu boundary

The adapter implements a provisional behavioral authentication boundary:

```text
account name + password
        |
        v
AberMUD account store
        |
        v
PrincipalId
        |
        v
new Session(principalId)
        |
        v
AberMUD character/login.ts
        |
        v
uaf.rand persona
        |
        v
Entity
```

`Session.principalId` is immutable after construction. Authentication therefore returns the `PrincipalId`; the caller that owns connection/session construction associates that principal with the new session. `engine/sessions` does not authenticate or mutate sessions.

## Provisional account storage

`FileAccountStore` stores JSON records with:

- normalized lower-case account name;
- random per-account salt;
- scrypt-derived password hash;
- explicit format version `1`;
- owner-only file permissions (`0600`) on the credential file;
- atomic replacement on writes and in-process serialization of concurrent account creation.

This is an implementation boundary, **not a historical `user_file` compatibility format**.

## Deliberate non-goals

This slice does not implement:

- historical `user_file` binary compatibility;
- password-change commands;
- account deletion;
- network prompts or transport negotiation;
- a generic engine-wide account/authentication abstraction.

Those remain separate until stronger historical evidence or another concrete adapter requires them.
