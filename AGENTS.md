# stratamu2

## Project Overview

An agnostic Node.js game engine for text-based multiplayer games (MUD, MUSH, MOO, MUCK, etc.).
The engine manages base functions shared by all styles, then exposes adapter interfaces so
different game styles, storage backends, and output protocols can be combined freely.

**Core principle:** Zero game-style, storage, or protocol assumptions in the source libraries.
Dependencies flow in one direction only: packages → adapters → apps.
