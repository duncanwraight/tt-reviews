import { useState } from "react";
import { Form, useLoaderData, useSubmit } from "react-router";
import type { SiteContent } from "~/lib/content.server";

interface ContentManagerProps {
  content: SiteContent[];
}

export function ContentManager({ content }: ContentManagerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [editingContent, setEditingContent] = useState<SiteContent | null>(
    null
  );
  const submit = useSubmit();

  // Get unique categories
  const categories = ["all", ...new Set(content.map(item => item.category))];

  // Filter content based on search and category
  const filteredContent = content.filter(item => {
    const matchesSearch =
      item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || item.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleSave = (updatedContent: SiteContent) => {
    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("key", updatedContent.key);
    formData.append("content", updatedContent.content);
    formData.append("description", updatedContent.description);
    formData.append("category", updatedContent.category);

    submit(formData, { method: "post" });
    setEditingContent(null);
  };

  const handleDelete = (key: string) => {
    if (confirm("Are you sure you want to delete this content item?")) {
      const formData = new FormData();
      formData.append("intent", "delete");
      formData.append("key", key);
      submit(formData, { method: "post" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Content Management
        </h1>
        <p className="text-gray-600">
          Manage all text snippets and descriptions across the website
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="search"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Search Content
            </label>
            <input
              id="search"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by key, content, or description..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Filter by Category
            </label>
            <select
              id="category"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              {categories.map(category => (
                <option key={category} value={category}>
                  {category === "all"
                    ? "All Categories"
                    : category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500">Total Content</h3>
          <p className="text-2xl font-bold text-gray-900">{content.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500">Categories</h3>
          <p className="text-2xl font-bold text-gray-900">
            {categories.length - 1}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500">
            Filtered Results
          </h3>
          <p className="text-2xl font-bold text-gray-900">
            {filteredContent.length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500">
            Selected Category
          </h3>
          <p className="text-2xl font-bold text-gray-900 capitalize">
            {selectedCategory === "all" ? "All" : selectedCategory}
          </p>
        </div>
      </div>

      {/* Content List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Content Items</h2>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredContent.map(item => (
            <ContentItem
              key={item.id}
              content={item}
              isEditing={editingContent?.id === item.id}
              onEdit={() => setEditingContent(item)}
              onSave={handleSave}
              onCancel={() => setEditingContent(null)}
              onDelete={() => handleDelete(item.key)}
            />
          ))}
        </div>

        {filteredContent.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-500">
              No content items found matching your criteria.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface ContentItemProps {
  content: SiteContent;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (content: SiteContent) => void;
  onCancel: () => void;
  onDelete: () => void;
}

function ContentItem({
  content,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
}: ContentItemProps) {
  const [editedContent, setEditedContent] = useState(content);

  const handleSave = () => {
    onSave(editedContent);
  };

  const handleCancel = () => {
    setEditedContent(content);
    onCancel();
  };

  if (isEditing) {
    return (
      <div className="px-6 py-4 bg-gray-50">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Key
            </label>
            <input
              type="text"
              value={editedContent.key}
              onChange={e =>
                setEditedContent({ ...editedContent, key: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content
            </label>
            <textarea
              value={editedContent.content}
              onChange={e =>
                setEditedContent({ ...editedContent, content: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              type="text"
              value={editedContent.description}
              onChange={e =>
                setEditedContent({
                  ...editedContent,
                  description: e.target.value,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <input
              type="text"
              value={editedContent.category}
              onChange={e =>
                setEditedContent({ ...editedContent, category: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md hover:bg-purple-700"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-2">
            <h3 className="text-sm font-medium text-gray-900 font-mono">
              {content.key}
            </h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              {content.category}
            </span>
          </div>

          <p className="text-sm text-gray-900 mb-2">{content.content}</p>

          <p className="text-xs text-gray-500">{content.description}</p>

          <p className="text-xs text-gray-400 mt-2">
            Last updated: {new Date(content.updated_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex space-x-2 ml-4">
          <button
            onClick={onEdit}
            className="text-sm text-purple-600 hover:text-purple-900 font-medium"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="text-sm text-red-600 hover:text-red-900 font-medium"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
