import { useState } from "react";
import { Form } from "react-router";
import type { Category, CategoryType } from "~/lib/categories.server";

interface CategoryManagerProps {
  categories: Category[];
  type: CategoryType;
  title: string;
  description: string;
  showFlags?: boolean;
  allowSubcategories?: boolean;
  parentCategories?: Category[];
}

export function CategoryManager({
  categories,
  type,
  title,
  description,
  showFlags = false,
  allowSubcategories = false,
  parentCategories = [],
}: CategoryManagerProps) {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  const sortedCategories = [...categories].sort(
    (a, b) => a.display_order - b.display_order
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-gray-600 text-sm">{description}</p>
        </div>
        <button
          onClick={() => setIsAddingNew(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          Add New
        </button>
      </div>

      {/* Add New Category Form */}
      {isAddingNew && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
          <h4 className="font-medium text-gray-900 mb-3">
            Add New {title.slice(0, -1)}
          </h4>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="create" />
            <input type="hidden" name="type" value={type} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Display Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="e.g., Long Pips"
                />
              </div>

              <div>
                <label
                  htmlFor="value"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Form Value *
                </label>
                <input
                  type="text"
                  id="value"
                  name="value"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="e.g., long_pips"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {showFlags && (
                <div>
                  <label
                    htmlFor="flag_emoji"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Flag Emoji
                  </label>
                  <input
                    type="text"
                    id="flag_emoji"
                    name="flag_emoji"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="🇺🇸"
                    maxLength={10}
                  />
                </div>
              )}

              {allowSubcategories && parentCategories.length > 0 && (
                <div>
                  <label
                    htmlFor="parent_id"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Parent Category {type === "review_rating_category" && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="parent_id"
                    name="parent_id"
                    required={type === "review_rating_category"}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">{type === "review_rating_category" ? "Select parent..." : "No Parent"}</option>
                    {parentCategories.map(parent => (
                      <option key={parent.id} value={parent.id}>
                        {parent.name}
                      </option>
                    ))}
                  </select>
                  {type === "review_rating_category" && (
                    <p className="text-xs text-gray-500 mt-1">
                      Rating categories must be linked to an equipment category or subcategory
                    </p>
                  )}
                </div>
              )}

              <div>
                <label
                  htmlFor="display_order"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Display Order
                </label>
                <input
                  type="number"
                  id="display_order"
                  name="display_order"
                  min="0"
                  defaultValue={categories.length + 1}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Create Category
              </button>
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Category List */}
      <div className="space-y-2">
        {sortedCategories.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            No categories found. Add one above.
          </p>
        ) : (
          sortedCategories.map((category, index) => {
            const parent = category.parent_id
              ? parentCategories.find(p => p.id === category.parent_id)
              : undefined;
            return (
              <CategoryItem
                key={category.id}
                category={category}
                isEditing={editingId === category.id}
                onEdit={() => setEditingId(category.id)}
                onCancelEdit={() => setEditingId(null)}
                showFlags={showFlags}
                allowSubcategories={allowSubcategories}
                parentCategories={parentCategories}
                parentName={parent?.name}
                onMoveUp={
                  index > 0
                    ? () => handleReorder(category.id, category.display_order - 1)
                    : undefined
                }
                onMoveDown={
                  index < sortedCategories.length - 1
                    ? () => handleReorder(category.id, category.display_order + 1)
                    : undefined
                }
              />
            );
          })
        )}
      </div>

      <p className="text-sm text-gray-500 mt-4">
        {categories.length}{" "}
        {categories.length === 1 ? "category" : "categories"} total
      </p>
    </div>
  );

  function handleReorder(categoryId: string, newOrder: number) {
    // This would need to be implemented with a reorder action
    // TODO: Implement reorder functionality
  }
}

interface CategoryItemProps {
  category: Category;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  showFlags: boolean;
  allowSubcategories: boolean;
  parentCategories: Category[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  parentName?: string;
}

function CategoryItem({
  category,
  isEditing,
  onEdit,
  onCancelEdit,
  showFlags,
  allowSubcategories,
  parentCategories,
  onMoveUp,
  onMoveDown,
  parentName,
}: CategoryItemProps) {
  if (isEditing) {
    return (
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="font-medium text-gray-900 mb-3">Edit Category</h4>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="id" value={category.id} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor={`edit-name-${category.id}`}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Display Name *
              </label>
              <input
                type="text"
                id={`edit-name-${category.id}`}
                name="name"
                required
                defaultValue={category.name}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label
                htmlFor={`edit-value-${category.id}`}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Form Value *
              </label>
              <input
                type="text"
                id={`edit-value-${category.id}`}
                name="value"
                required
                defaultValue={category.value}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {showFlags && (
              <div>
                <label
                  htmlFor={`edit-flag-${category.id}`}
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Flag Emoji
                </label>
                <input
                  type="text"
                  id={`edit-flag-${category.id}`}
                  name="flag_emoji"
                  defaultValue={category.flag_emoji || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  maxLength={10}
                />
              </div>
            )}

            <div>
              <label
                htmlFor={`edit-order-${category.id}`}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Display Order
              </label>
              <input
                type="number"
                id={`edit-order-${category.id}`}
                name="display_order"
                min="0"
                defaultValue={category.display_order}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label
                htmlFor={`edit-active-${category.id}`}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Status
              </label>
              <select
                id={`edit-active-${category.id}`}
                name="is_active"
                defaultValue={category.is_active.toString()}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Update Category
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </Form>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      <div className="flex items-center space-x-3">
        {/* Drag Handle */}
        <div className="cursor-move text-gray-400 hover:text-gray-600">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 2zM7 8a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 8zM7 14a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 14zM13 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 2zM13 8a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 8zM13 14a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 14z"></path>
          </svg>
        </div>

        {/* Category Info */}
        <div className="flex items-center space-x-2">
          {showFlags && category.flag_emoji && (
            <span className="text-lg">{category.flag_emoji}</span>
          )}
          <span className="font-medium">{category.name}</span>
          <span className="text-sm text-gray-500">({category.value})</span>
          {parentName && (
            <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded">
              {parentName}
            </span>
          )}
          {allowSubcategories && !parentName && !category.parent_id && (
            <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
              No parent!
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {/* Status Badge */}
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            category.is_active
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {category.is_active ? "Active" : "Inactive"}
        </span>

        {/* Display Order */}
        <span className="text-xs text-gray-400">#{category.display_order}</span>

        {/* Reorder Buttons */}
        <div className="flex space-x-1">
          {onMoveUp && (
            <button
              onClick={onMoveUp}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Move Up"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                  clipRule="evenodd"
                ></path>
              </svg>
            </button>
          )}
          {onMoveDown && (
            <button
              onClick={onMoveDown}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Move Down"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                ></path>
              </svg>
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-1">
          <button
            onClick={onEdit}
            className="p-1 text-blue-600 hover:text-blue-800"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path>
            </svg>
          </button>

          <Form method="post" className="inline">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="id" value={category.id} />
            <button
              type="submit"
              className="p-1 text-red-600 hover:text-red-800"
              title="Delete"
              onClick={e => {
                if (
                  !confirm(
                    `Are you sure you want to delete "${category.name}"? This action cannot be undone.`
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 112 0v3a1 1 0 11-2 0V9zm4 0a1 1 0 112 0v3a1 1 0 11-2 0V9z"
                  clipRule="evenodd"
                ></path>
              </svg>
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
