import enum

from sqlalchemy import CheckConstraint


def enum_check(column: str, enum_cls: type[enum.Enum]) -> CheckConstraint:
    values = ", ".join(f"'{member.name}'" for member in enum_cls)
    return CheckConstraint(f"{column} IN ({values})", name=column)
