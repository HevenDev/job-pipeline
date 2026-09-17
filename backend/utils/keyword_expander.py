"""
utils/keyword_expander.py — Dynamic keyword variant generator.

Expands a raw role keyword ("java", "python", "react") into a list of
concrete job-title search terms. Works for any arbitrary input — there
is no hardcoded role map.

Logic:
  - If the role already contains a "role token" (developer, engineer,
    scientist, etc.) it is already a specific title → return as-is, no
    expansion (avoids nonsense like "java developer developer").
  - Otherwise apply template patterns to generate several variants.

Examples:
  "java"             → ["java", "java developer", "java engineer",
                         "senior java developer", "java backend developer"]
  "python"           → ["python", "python developer", "python engineer", ...]
  "machine learning" → ["machine learning", "machine learning engineer", ...]
  "java developer"   → ["java developer"]   (already has role-token)
  "senior sde"       → ["senior sde"]        (same)
"""
from __future__ import annotations

# Tokens whose presence signals the role is already a full job title.
_ROLE_TOKENS: frozenset[str] = frozenset(
    {
        "developer",
        "engineer",
        "dev",
        "programmer",
        "architect",
        "lead",
        "analyst",
        "scientist",
        "manager",
        "designer",
        "consultant",
        "specialist",
        "associate",
        "intern",
        "sde",
        "swe",
        "devops",
        "administrator",
        "admin",
    }
)

# Templates applied (in order) when the role has no role-token.
# {role} is substituted with the lowercased input.
_TEMPLATES: list[str] = [
    "{role}",
    "{role} developer",
    "{role} engineer",
    "senior {role} developer",
    "{role} backend developer",
]


def expand(role: str) -> list[str]:
    """Return an ordered list of keyword variants for *role*.

    The original term is always first.  No duplicates.
    """
    role_clean = role.strip().lower()
    tokens = set(role_clean.split())

    # If already a specific title — no expansion
    if tokens & _ROLE_TOKENS:
        return [role_clean]

    # Raw keyword — apply templates
    seen: set[str] = set()
    variants: list[str] = []
    for tpl in _TEMPLATES:
        v = tpl.format(role=role_clean)
        if v not in seen:
            seen.add(v)
            variants.append(v)

    return variants
