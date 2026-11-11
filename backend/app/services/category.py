"""Product categories: a tree, at most MAX_DEPTH levels deep.

Every change to the tree's shape (creating, moving, archiving) takes one transaction-level
advisory lock first, so two changes can't each pass their checks and together create a
loop or a branch that's too deep.
"""

from sqlalchemy import Text, cast, func, literal, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.product import Product
from app.schemas.category import CategoryCreate, CategoryUpdate
from app.services.common import InvalidReference

MAX_DEPTH = 5
_TREE_LOCK = 7_406_311  # any fixed number; it names the lock, nothing else uses it


class CategoryNotFound(Exception): ...  # 404


class CategoryConflict(Exception): ...  # 409, with a message saying why


async def _lock_tree(db: AsyncSession) -> None:
    # Held until commit or rollback; other tree changes wait for it, reads don't
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _TREE_LOCK})


def _subtree(category_id: int):
    """The category and everything below it, with each one's level under it (0 = itself)."""
    tree = (
        select(Category.id, literal(0).label("level"))
        .where(Category.id == category_id)
        .cte("subtree", recursive=True)
    )
    return tree.union_all(
        select(Category.id, tree.c.level + 1).join(tree, Category.parent_id == tree.c.id)
    )


async def subtree_ids(db: AsyncSession, category_id: int) -> list[int]:
    tree = _subtree(category_id)
    return list(await db.scalars(select(tree.c.id)))


async def _depth(db: AsyncSession, category_id: int) -> int:
    """How deep a category sits: 1 for a top-level one."""
    up = (
        select(Category.parent_id, literal(1).label("depth"))
        .where(Category.id == category_id)
        .cte("ancestors", recursive=True)
    )
    up = up.union_all(
        select(Category.parent_id, up.c.depth + 1).join(up, Category.id == up.c.parent_id)
    )
    return int(await db.scalar(select(func.max(up.c.depth))) or 0)


async def list_categories(db: AsyncSession, include_archived: bool = False) -> list[dict]:
    """Every category with its full path, sorted the way a tree reads."""
    tree = (
        select(
            Category.id,
            Category.name,
            Category.parent_id,
            Category.is_active,
            # text, not the column's varchar(100): a path is longer than one name, and both
            # halves of a recursive query must produce the same type
            cast(Category.name, Text).label("path"),
            literal(1).label("depth"),
        )
        .where(Category.parent_id.is_(None))
        .cte("tree", recursive=True)
    )
    tree = tree.union_all(
        select(
            Category.id,
            Category.name,
            Category.parent_id,
            Category.is_active,
            cast(tree.c.path + " / " + Category.name, Text).label("path"),
            tree.c.depth + 1,
        ).join(tree, Category.parent_id == tree.c.id)
    )
    stmt = select(tree).order_by(func.lower(tree.c.path))
    if not include_archived:
        stmt = stmt.where(tree.c.is_active)
    return [dict(row) for row in (await db.execute(stmt)).mappings()]


async def read_category(db: AsyncSession, category_id: int) -> dict:
    for row in await list_categories(db, include_archived=True):
        if row["id"] == category_id:
            return row
    raise CategoryNotFound(category_id)


async def _usable_parent(db: AsyncSession, parent_id: int) -> Category:
    parent = await db.get(Category, parent_id)
    if parent is None or not parent.is_active:
        raise InvalidReference(f"category {parent_id} not found")
    return parent


async def _commit_name(db: AsyncSession, name: str) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "uq_categories_sibling_name" in str(exc.orig):
            raise CategoryConflict(f"there is already a category named {name!r} here") from None
        raise


async def create_category(db: AsyncSession, data: CategoryCreate) -> dict:
    await _lock_tree(db)
    if data.parent_id is not None:
        await _usable_parent(db, data.parent_id)
        if await _depth(db, data.parent_id) + 1 > MAX_DEPTH:
            raise CategoryConflict(f"categories can only nest {MAX_DEPTH} levels deep")
    category = Category(name=data.name.strip(), parent_id=data.parent_id)
    db.add(category)
    await _commit_name(db, category.name)
    return await read_category(db, category.id)


async def update_category(db: AsyncSession, category_id: int, data: CategoryUpdate) -> dict:
    await _lock_tree(db)
    category = await db.get(Category, category_id)
    if category is None:
        raise CategoryNotFound(category_id)

    if "parent_id" in data.model_fields_set and data.parent_id != category.parent_id:
        if data.parent_id is not None:
            await _usable_parent(db, data.parent_id)
            moving = await subtree_ids(db, category_id)
            if data.parent_id in moving:
                raise CategoryConflict(
                    "a category can't move under itself or one of its own subcategories"
                )
            tree = _subtree(category_id)
            height = int(await db.scalar(select(func.max(tree.c.level))) or 0) + 1
            if await _depth(db, data.parent_id) + height > MAX_DEPTH:
                raise CategoryConflict(f"categories can only nest {MAX_DEPTH} levels deep")
        category.parent_id = data.parent_id
    if data.name is not None:
        category.name = data.name.strip()
    await _commit_name(db, category.name)
    return await read_category(db, category_id)


async def lock_usable_category(db: AsyncSession, category_id: int) -> Category:
    """For giving a product this category. The shared lock lets many products take it at
    once, but makes archiving it wait (and archiving makes this wait), so a product can't
    land in a category that's being archived."""
    category = await db.scalar(
        select(Category)
        .where(Category.id == category_id)
        .with_for_update(read=True)
        .execution_options(populate_existing=True)
    )
    if category is None or not category.is_active:
        raise InvalidReference(f"category {category_id} not found")
    return category


async def set_active(db: AsyncSession, category_id: int, active: bool) -> dict:
    await _lock_tree(db)
    category = await db.scalar(
        select(Category)
        .where(Category.id == category_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if category is None:
        raise CategoryNotFound(category_id)

    if not active:
        products = select(Product.id).where(Product.category_id == category_id, Product.is_active)
        if (await db.scalars(products)).first() is not None:
            raise CategoryConflict("it still has active products")
        children = select(Category.id).where(Category.parent_id == category_id, Category.is_active)
        if (await db.scalars(children)).first() is not None:
            raise CategoryConflict("it still has active subcategories")
    elif category.parent_id is not None:
        parent = await db.get(Category, category.parent_id)
        if parent is not None and not parent.is_active:
            raise CategoryConflict("its parent category is archived")

    category.is_active = active
    await db.commit()
    return await read_category(db, category_id)
