"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  Search,
  Filter,
  Plus,
  Edit2,
  FileSpreadsheet,
  X,
} from "lucide-react";
import { Product, Category } from "@/lib/types";
import { formatINR } from "@/lib/calculations/financial";
import { useAuth } from "@/lib/auth/AuthContext";
import { Lock } from "lucide-react";

export default function ProductsPage() {
  const { currentUser, isSuperAdmin, hasPermission, fetchWithAuth } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    alias: "",
    categoryName: "General",
    sizeSpec: "",
    unit: "Nos",
    defaultRentalRate: 0,
    rentalRateUnit: "PER_DAY",
    securityDepositAmount: 0,
    totalOwnedQuantity: 0,
    minRentalDuration: 1,
    notes: "",
  });

  const loadData = () => {
    fetch(`/api/products?q=${encodeURIComponent(search)}&category=${encodeURIComponent(selectedCategory)}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      });
  };

  useEffect(() => {
    loadData();
  }, [search, selectedCategory]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        alert("Product added to Shared Master successfully!");
        setShowAddModal(false);
        setFormData({
          name: "",
          alias: "",
          categoryName: "General",
          sizeSpec: "",
          unit: "Nos",
          defaultRentalRate: 0,
          rentalRateUnit: "PER_DAY",
          securityDepositAmount: 0,
          totalOwnedQuantity: 0,
          minRentalDuration: 1,
          notes: "",
        });
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create product");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingProduct),
      });
      if (res.ok) {
        alert("Product updated successfully!");
        setEditingProduct(null);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update product");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Permission Guard: products:view required to view products catalog
  if (!isSuperAdmin && !hasPermission("products:view")) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-amber-900">Access Denied: Product Master Access Restricted</h2>
          <p className="text-sm text-amber-800 max-w-lg mx-auto">
            Your current account (<strong>{currentUser?.name || "User"}</strong>, role: {currentUser?.role || "GUEST"}) does not have the <strong>View Products</strong> permission.
          </p>
          <p className="text-xs text-amber-700 font-medium">
            Contact the Super Administrator or switch accounts to view or manage inventory.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <Package className="w-6 h-6 text-blue-600" />
            Centralized Product Master
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Single shared catalog and physical inventory pool across issuing companies. Add and edit products manually.
          </p>
        </div>

        {(isSuperAdmin || hasPermission("products:create")) && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 p-3 rounded-xl flex flex-col sm:flex-row items-center gap-3 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search products by name, alias, or size specification..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none"
          >
            <option value="">All Categories</option>
            <option value="General">General</option>
            <option value="Furniture & Seating">Furniture & Seating</option>
            <option value="Stalls & Infrastructure">Stalls & Infrastructure</option>
            <option value="Electricals & Cooling">Electricals & Cooling</option>
            <option value="Carpets & Linens">Carpets & Linens</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Item Name / Alias</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Size / Unit</th>
                <th className="py-3 px-3 text-right">Default Rate</th>
                <th className="py-3 px-3 text-center">Owned</th>
                <th className="py-3 px-3 text-center">Available</th>
                <th className="py-3 px-3 text-center">Rented</th>
                <th className="py-3 px-3 text-center">Damaged</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No products found. Import products from Excel or click "Add Product".
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      <div>{p.name}</div>
                      {p.alias && <div className="text-[10px] text-slate-500 font-mono">Alias: {p.alias}</div>}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                        {p.categoryName || "General"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {p.sizeSpec || "-"} <span className="text-[10px] text-slate-400">({p.unit})</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600">
                      {p.defaultRentalRate > 0 ? (
                        formatINR(p.defaultRentalRate)
                      ) : (
                        <span className="text-slate-400 text-[10px]">Unset</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">{p.totalOwnedQuantity}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600">{p.availableQuantity}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-semibold text-amber-600">{p.rentedQuantity}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-semibold text-rose-600">{p.damagedQuantity}</td>
                    <td className="py-2.5 px-4 text-right">
                      {(isSuperAdmin || hasPermission("products:edit")) && (
                        <button
                          onClick={() => setEditingProduct({ ...p })}
                          className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-blue-600 transition border border-slate-200"
                          title="Edit product"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-lg w-full my-8 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Add Product to Shared Master
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Product / Item Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., LED Stage, 10kg Dabara, Chair With Cover"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Alias / Short Name</label>
                  <input
                    type="text"
                    value={formData.alias}
                    onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Category</label>
                  <select
                    value={formData.categoryName}
                    onChange={(e) => setFormData({ ...formData, categoryName: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="General">General</option>
                    <option value="Furniture & Seating">Furniture & Seating</option>
                    <option value="Stalls & Infrastructure">Stalls & Infrastructure</option>
                    <option value="Electricals & Cooling">Electricals & Cooling</option>
                    <option value="Carpets & Linens">Carpets & Linens</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Size / Specification</label>
                  <input
                    type="text"
                    value={formData.sizeSpec}
                    onChange={(e) => setFormData({ ...formData, sizeSpec: e.target.value })}
                    placeholder="e.g. 4*18, 8*8, Standard"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Unit of Measurement</label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="Nos, SqFt, Set"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Default Rental Rate (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.defaultRentalRate}
                    onChange={(e) => setFormData({ ...formData, defaultRentalRate: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Total Owned Quantity</label>
                  <input
                    type="number"
                    value={formData.totalOwnedQuantity}
                    onChange={(e) => setFormData({ ...formData, totalOwnedQuantity: parseInt(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-sm"
                >
                  {saving ? "Saving..." : "Create Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-lg w-full my-8 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                Edit Product: {editingProduct.name}
              </h3>
              <button onClick={() => setEditingProduct(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Item Name</label>
                <input
                  type="text"
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Default Rental Rate (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingProduct.defaultRentalRate}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, defaultRentalRate: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Total Owned Physical Stock</label>
                  <input
                    type="number"
                    value={editingProduct.totalOwnedQuantity}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, totalOwnedQuantity: parseInt(e.target.value) || 0 })
                    }
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                <div>
                  <label className="block text-slate-500 text-[10px] uppercase font-bold">Rented</label>
                  <div className="font-mono text-amber-600 text-sm font-bold">{editingProduct.rentedQuantity}</div>
                </div>
                <div>
                  <label className="block text-slate-500 text-[10px] uppercase font-bold">Damaged</label>
                  <input
                    type="number"
                    value={editingProduct.damagedQuantity}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, damagedQuantity: parseInt(e.target.value) || 0 })
                    }
                    className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-rose-600 font-mono font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-[10px] uppercase font-bold">Available</label>
                  <div className="font-mono text-emerald-600 text-sm font-bold">{editingProduct.availableQuantity}</div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-sm"
                >
                  {saving ? "Saving..." : "Update Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
