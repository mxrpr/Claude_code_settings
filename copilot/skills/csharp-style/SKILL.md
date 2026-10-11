---
name: csharp-style
description: >
  C# coding style conventions to apply when writing or editing C# code. Use when adding
  or modifying C# files, or when asked to "follow C# style", "clean up C#", "apply coding
  conventions". Enforces explicit types, documentation comments, braces, explicit created types.
---

# C# coding style

Apply these rules to every C# file you write or edit. They override terser defaults.

---

## Rules

### 1. Explicit types everywhere possible

Do **not** use `var` when the type can be written explicitly.

```csharp
// NO
var users = GetUsers();
var count = 0;
foreach (var u in users) { }

// YES
List<User> users = GetUsers();
int count = 0;
foreach (User u in users) { }
```

Exception: genuinely un-nameable types (anonymous types, some LINQ projections) — use `var` only there.

### 2. Documentation comments on members

Every public/internal type, method, and property gets an XML doc comment.

```csharp
/// <summary>
/// Resolves the tenant context for the given bearer token.
/// </summary>
/// <param name="token">Raw bearer token from the request.</param>
/// <returns>The resolved <see cref="TenantContext"/>.</returns>
public TenantContext Resolve(string token) { }
```

Private members: doc comment when intent isn't obvious from the name.

### 3. Braces on all `if` / `else` (and loops)

Never single-line bodyless blocks.

```csharp
// NO
if (x) DoThing();
if (x) return;
else Other();

// YES
if (x)
{
    DoThing();
}
else
{
    Other();
}
```

### 4. Always specify the created type

Do not use target-typed `new()` — write the type on both sides.

```csharp
// NO
List<string> names = new();
Dictionary<string, int> map = new();

// YES
List<string> names = new List<string>();
Dictionary<string, int> map = new Dictionary<string, int>();
```

---

## Checklist before finishing a C# edit

- [ ] No `var` where an explicit type fits
- [ ] Doc comment on every new public/internal member
- [ ] Braces on all `if`/`else`/loops
- [ ] Explicit created type on every `new` (no `new()`)
