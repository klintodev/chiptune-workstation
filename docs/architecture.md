# Architecture conventions

## JavaScript design

Prefer functional object-oriented design using closures and factory functions over class-based object-oriented design.

- Keep mutable state private inside a factory closure.
- Return a small object containing the operations consumers need.
- Compose modules through explicit function arguments and returned interfaces.
- Prefer plain serializable data for application state.
- Use classes only when a platform API requires them or when they provide a concrete advantage that a closure cannot express as clearly.

The audio engine demonstrates the intended pattern: `createAudioEngine()` owns its Web Audio state and returns a frozen public interface.
