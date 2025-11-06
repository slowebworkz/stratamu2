# Event System Inheritance Refactor Plan

## Current Architecture Problems

### Current Inheritance Order (BROKEN)

```
Emittery (base library)
↑ extends
SafeEmitter (FOUNDATIONAL ERROR HANDLING)
↑ extends
LoggedEmitter (adds logging to safe base)
↑ extends
FilteredPriorityEmitter (adds filtering/priorities to logged safe base)
↑ extends
BubblingEmitter (adds bubbling to filtered safe base)
↑ extends
DestroyableEmitter (final lifecycle management)

```

### Critical Issues with Current Design

1. **FilteredPriorityEmitter.emitWithPriority() has no error protection**

   ```typescript
   // Direct listener execution without try/catch
   await listener.callback(...args) // UNSAFE!
   ```

2. **Only emitSafe() is actually safe**
   - Direct `emit()` calls bypass all error handling
   - Priority emissions are completely unprotected
   - Most of the event system is unsafe

3. **Architectural confusion**
   - Error handling should be foundational, not top-layer
   - SafeEmitter depends on logging but is above LoggedEmitter
   - Violates principle of least surprise

## Required Refactor Plan

### Target Inheritance Order (CORRECT)

```
Emittery (base library)
  ↑ extends
SafeEmitter (FOUNDATIONAL ERROR HANDLING)
  ↑ extends
LoggedEmitter (adds logging to safe base)
  ↑ extends
FilteredPriorityEmitter (adds filtering/priorities to logged safe base)
  ↑ extends
MetricsEmitter (adds metrics to filtered safe base)
  ↑ extends
BubblingEmitter (adds bubbling to metrics safe base)
  ↑ extends
DestroyableEmitter (final lifecycle management)
```

### Benefits of New Order

1. **Universal Safety**: ALL emit operations go through SafeEmitter
2. **Proper Dependencies**: SafeEmitter can use logging without circular deps
3. **Consistent Error Handling**: No methods bypass error protection
4. **Intuitive Architecture**: Foundation → Features → Lifecycle

## Detailed Refactor Steps

### Phase 1: Prepare SafeEmitter as Base Class

**File: `packages/base/src/events/safe-emitter.ts`**

Changes needed:

- Remove dependency on `this.log` (move to LoggedEmitter)
- Make SafeEmitter extend Emittery directly
- Implement emit() override with try/catch (not just listener wrapping)
- Keep emitSafe() as alias for emit()

```typescript
// BEFORE (extends MetricsEmitter)
export class SafeEmitter<EventMap extends AnyEventMap = AnyEventMap>
  extends MetricsEmitter<EventMap> {

// AFTER (extends Emittery)
export class SafeEmitter<EventMap extends AnyEventMap = AnyEventMap>
  extends Emittery<EventMap> {
```

### Phase 2: Update LoggedEmitter

**File: `packages/base/src/events/logged-emitter.ts`**

Changes needed:

- Extend SafeEmitter instead of Emittery
- Add error logging capability that SafeEmitter can use
- Maintain backward compatibility

```typescript
// BEFORE
export class LoggedEmitter<EventMap extends AnyEventMap = AnyEventMap>
  extends Emittery<EventMap> {

// AFTER
export class LoggedEmitter<EventMap extends AnyEventMap = AnyEventMap>
  extends SafeEmitter<EventMap> {
```

### Phase 3: Update FilteredPriorityEmitter

**File: `packages/base/src/events/filtered-priority-emitter.ts`**

Changes needed:

- Extend LoggedEmitter instead of LoggedEmitter
- Ensure emitWithPriority() uses parent emit() (now safe)
- Remove manual try/catch (handled by SafeEmitter)

```typescript
// BEFORE
export class FilteredPriorityEmitter<
  EventMap extends AnyEventMap = AnyEventMap,
> extends LoggedEmitter<EventMap> {
  // emitWithPriority with manual error handling
  async emitWithPriority() {
    try {
      await listener.callback(...args) // UNSAFE
    } catch (error) {
      errors.push(error)
    }
  }
}

// AFTER
export class FilteredPriorityEmitter<
  EventMap extends AnyEventMap = AnyEventMap,
> extends LoggedEmitter<EventMap> {
  // emitWithPriority delegates to safe emit()
  async emitWithPriority() {
    // Let SafeEmitter handle error protection
    await this.emit(event, ...args) // NOW SAFE
  }
}
```

### Phase 5: Update BubblingEmitter

**File: `packages/base/src/events/bubbling-emitter.ts`**

Changes needed:

- Extend MetricsEmitter (same as current)
- Remove emitSafe() calls, use emit() directly (now universally safe)
- Simplify code since all emissions are protected

```typescript
// BEFORE
await this.emitSafe(eventName, ...args) // Only this was safe

// AFTER
await this.emit(eventName, ...args) // ALL emit() calls are safe now
```

### Phase 6: Update DestroyableEmitter

**File: `packages/base/src/events/destroyable-emitter.ts`**

Changes needed:

- Extend BubblingEmitter (same as current)
- All lifecycle operations now benefit from universal safety
- No specific changes needed

## Testing Strategy

### Phase 1: Preparation Tests

1. Create SafeEmitter unit tests that don't depend on logging
2. Test error handling for all emit scenarios
3. Ensure Emittery compatibility

### Phase 2: Integration Tests

1. Test each class change individually
2. Run full test suite after each phase
3. Verify error handling works at every level

### Phase 3: End-to-End Validation

1. Test all emit methods are safe: `emit()`, `emitWithPriority()`, `emitWithBubble()`
2. Verify metrics collection works with new order
3. Confirm bubbling and lifecycle management unchanged

## Risk Assessment

### High Risk Changes

- SafeEmitter refactor (base class changes)
- Error handling mechanism changes
- Potential breaking changes in error callback signatures

### Medium Risk Changes

- FilteredPriorityEmitter.emitWithPriority() logic
- MetricsEmitter emit() flow
- LoggedEmitter dependencies

### Low Risk Changes

- BubblingEmitter (minimal changes)
- DestroyableEmitter (no changes needed)

## Implementation Timeline

1. **Week 1**: Phase 1-2 (SafeEmitter + LoggedEmitter base changes)
2. **Week 2**: Phase 3-4 (FilteredPriorityEmitter + MetricsEmitter)
3. **Week 3**: Phase 5-6 (BubblingEmitter + DestroyableEmitter)
4. **Week 4**: Integration testing and bug fixes

## Success Criteria

✅ **All emit methods are safe by default** ✅ **No methods bypass error handling** ✅ **All 228+
tests continue to pass** ✅ **Performance impact < 5%** ✅ **Clean, intuitive inheritance
hierarchy** ✅ **Backward compatibility maintained**

## Current Status: URGENT REFACTOR NEEDED

The current architecture has **critical safety vulnerabilities** where most emit operations bypass
error handling entirely. This refactor is not optional - it's essential for system reliability.
