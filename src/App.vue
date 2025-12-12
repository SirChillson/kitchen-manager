<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { supabase } from './supabase'

// --- AUTH STATE ---
const session = ref(null)
const loading = ref(true)
const email = ref('')
const password = ref('')

// --- APP STATE ---
const activeTab = ref('inventory')
const inventory = ref([])
const recipes = ref([])
const productionPlan = ref({}) 
const isSaving = ref(false)
const errorMessage = ref('')
const selectedRecipe = ref(null)
const printMode = ref(null)

// --- FILTERS ---
const invSearch = ref(''); const invSort = ref('name')
const recSearch = ref(''); const recFilterMeal = ref('all'); const recFilterCat = ref('all')
const planSearch = ref(''); const planFilterMeal = ref('all'); const planFilterCat = ref('all')

// --- FORMS ---
const showRecipeForm = ref(false); const showQuickAdd = ref(false)
const newIngredient = ref({ name: '', base_unit: 'g', unit_category: 'mass', stock_quantity: 0 })
const newRecipe = ref({ name: '', instructions: '', meal_type: 'any', dish_category: 'other', servings: '' })
const newRecipeIngredients = ref([{ inventory_item_id: '', quantity_needed: 0 }])

// --- AUTH FUNCTIONS ---
async function handleLogin() {
  const { error } = await supabase.auth.signInWithPassword({ email: email.value, password: password.value })
  if (error) alert(error.message)
}
async function handleLogout() { await supabase.auth.signOut() }

// --- DATA FETCHING ---
async function getInventory() {
  let { data, error } = await supabase.from('inventory_items').select('*').order('name')
  if (error) errorMessage.value = error.message
  else inventory.value = data.map(item => ({ ...item, ui_unit: item.base_unit }))
}
async function getRecipes() {
  let { data, error } = await supabase.from('recipes').select(`id, name, instructions, meal_type, dish_category, servings, recipe_ingredients (quantity_needed, inventory_item_id, inventory_items (name, base_unit))`)
  if (error) errorMessage.value = error.message
  else recipes.value = data
}

// --- INITIALIZATION ---
onMounted(() => {
  supabase.auth.getSession().then(({ data }) => {
    session.value = data.session
    if (session.value) { getInventory(); getRecipes() }
    loading.value = false
  })
  supabase.auth.onAuthStateChange((_event, _session) => {
    session.value = _session
    if (_session) { getInventory(); getRecipes() }
  })
})

// --- COMPUTED LISTS ---
const filteredInventory = computed(() => {
  let list = inventory.value.filter(i => i.name.toLowerCase().includes(invSearch.value.toLowerCase()))
  if (invSort.value === 'low_stock') return list.sort((a, b) => a.stock_quantity - b.stock_quantity)
  return list.sort((a, b) => a.name.localeCompare(b.name))
})
const filteredRecipes = computed(() => {
  return recipes.value.filter(r => {
    return r.name.toLowerCase().includes(recSearch.value.toLowerCase()) &&
           (recFilterMeal.value === 'all' || r.meal_type === recFilterMeal.value) &&
           (recFilterCat.value === 'all' || r.dish_category === recFilterCat.value)
  })
})
const plannerList = computed(() => recipes.value.filter(r => productionPlan.value.hasOwnProperty(r.id)))
const filteredPlanRecipes = computed(() => {
  return recipes.value.filter(r => {
    return productionPlan.value.hasOwnProperty(r.id) &&
           r.name.toLowerCase().includes(planSearch.value.toLowerCase()) &&
           (planFilterMeal.value === 'all' || r.meal_type === planFilterMeal.value) &&
           (planFilterCat.value === 'all' || r.dish_category === planFilterCat.value)
  })
})

// --- EXPORT LOGIC ---
const shoppingList = computed(() => {
  if (recipes.value.length === 0 || inventory.value.length === 0) return []
  const needs = {}; const toOrder = []
  plannerList.value.forEach(r => {
    const batches = productionPlan.value[r.id] || 0
    if (batches > 0) {
      r.recipe_ingredients.forEach(i => {
        if(i.inventory_item_id) needs[i.inventory_item_id] = (needs[i.inventory_item_id] || 0) + (i.quantity_needed * batches)
      })
    }
  })
  inventory.value.forEach(item => {
    const needed = needs[item.id] || 0
    if (needed > item.stock_quantity) toOrder.push({ name: item.name, order: needed - item.stock_quantity, unit: item.base_unit })
  })
  return toOrder
})

const printRecipePack = computed(() => {
  return plannerList.value.map(recipe => {
    const batches = productionPlan.value[recipe.id] || 0
    return {
      ...recipe, batches: batches,
      scaledIngredients: recipe.recipe_ingredients.map(ing => ({
        name: ing.inventory_items?.name || 'Unknown', unit: ing.inventory_items?.base_unit || '', amount: ing.quantity_needed * batches
      }))
    }
  })
})

function triggerPrint(mode) {
  printMode.value = mode
  nextTick(() => { window.print() })
}

// --- ACTIONS ---
function updateStockFromInput(item, value) { if (item.ui_unit === 'kg' || item.ui_unit === 'L') item.stock_quantity = value * 1000; else item.stock_quantity = value }
function getDisplayValue(item) { if (item.ui_unit === 'kg' || item.ui_unit === 'L') return item.stock_quantity / 1000; return item.stock_quantity }
function addToPlan(recipe) { if (!productionPlan.value[recipe.id]) { productionPlan.value[recipe.id] = 1; alert(`Added ${recipe.name} to Planner`) } else alert(`${recipe.name} is already in the planner`) }
function removeFromPlan(recipeId) { delete productionPlan.value[recipeId] }
async function saveStock() { isSaving.value = true; const cleanData = inventory.value.map(({ ui_unit, ...item }) => item); const { error } = await supabase.from('inventory_items').upsert(cleanData); isSaving.value = false; if (error) alert(error.message); else alert('✅ Inventory Updated!') }
async function addIngredient() { if (!newIngredient.value.name) return alert("Name Required"); isSaving.value = true; const { data, error } = await supabase.from('inventory_items').insert([newIngredient.value]).select(); isSaving.value = false; if (!error) { await getInventory(); newIngredient.value = { name: '', base_unit: 'g', unit_category: 'mass', stock_quantity: 0 }; if (showQuickAdd.value) { showQuickAdd.value = false; const lastRow = newRecipeIngredients.value[newRecipeIngredients.value.length - 1]; lastRow.inventory_item_id = data[0].id } alert('Ingredient Added!') } else { alert(error.message) } }
async function saveNewRecipe() { if (!newRecipe.value.name) return alert("Name Required"); isSaving.value = true; const { data, error } = await supabase.from('recipes').insert([newRecipe.value]).select(); if (error) { alert(error.message); isSaving.value = false; return; } const newID = data[0].id; const validIngs = newRecipeIngredients.value.filter(r => r.inventory_item_id && r.quantity_needed > 0); if (validIngs.length > 0) { await supabase.from('recipe_ingredients').insert(validIngs.map(r => ({ recipe_id: newID, inventory_item_id: r.inventory_item_id, quantity_needed: r.quantity_needed }))) } isSaving.value = false; showRecipeForm.value = false; newRecipe.value = { name: '', instructions: '', meal_type: 'any', dish_category: 'other', servings: '' }; newRecipeIngredients.value = [{ inventory_item_id: '', quantity_needed: 0 }]; getRecipes(); alert('Recipe Saved!') }
</script>

<template>
  
  <div v-if="loading" class="loading-screen">Loading...</div>

  <div v-else-if="!session" class="app-container auth-container">
    <h1>🔐 Kitchen Login</h1>
    <div class="card">
        <p style="text-align:center; margin-bottom: 20px;">Please sign in to access inventory.</p>
        <div style="margin-bottom: 15px;">
            <label>Email</label>
            <input v-model="email" type="email" placeholder="chef@kitchen.com" class="full-width">
        </div>
        <div style="margin-bottom: 20px;">
            <label>Password</label>
            <input v-model="password" type="password" placeholder="********" class="full-width">
        </div>
        <button @click="handleLogin" class="big-btn">Sign In</button>
    </div>
  </div>

  <div v-else class="app-container">
    
    <div class="header no-print">
        <h1>👨‍🍳 Kitchen Manager</h1>
        <button @click="handleLogout" class="logout-btn">Logout</button>
    </div>

    <div class="tabs no-print">
      <button @click="activeTab = 'inventory'" :class="{ active: activeTab === 'inventory' }">Stock</button>
      <button @click="activeTab = 'recipes'" :class="{ active: activeTab === 'recipes' }">Recipes</button>
      <button @click="activeTab = 'planner'" :class="{ active: activeTab === 'planner' }" class="planner-tab-btn">Planner</button>
    </div>

    <div v-if="activeTab === 'inventory'" class="no-print">
        <div class="filter-bar">
            <input v-model="invSearch" placeholder="🔍 Search Ingredients..." class="search-input">
            <select v-model="invSort" class="filter-select"><option value="name">A-Z</option><option value="low_stock">Lowest Stock</option></select>
        </div>
        <div class="card add-box">
            <div style="display:flex; gap:5px;">
                <input v-model="newIngredient.name" placeholder="New Item Name" style="flex:2">
                <select v-model="newIngredient.base_unit" style="flex:1"><option value="g">g</option><option value="ml">ml</option><option value="ea">ea</option></select>
                <select v-model="newIngredient.unit_category" style="flex:1"><option value="mass">Mass</option><option value="volume">Vol</option><option value="count">Count</option></select>
                <button @click="addIngredient" class="btn-blue">Add</button>
            </div>
        </div>
        <button @click="saveStock" class="save-btn" :disabled="isSaving">{{ isSaving ? 'Saving...' : '💾 Save Counts' }}</button>
        <div v-for="item in filteredInventory" :key="item.id" class="inventory-row">
            <div class="row-label"><strong>{{ item.name }}</strong></div>
            <div class="row-inputs">
                <select v-model="item.ui_unit" class="unit-toggle"><option :value="item.base_unit">{{ item.base_unit }}</option><option v-if="item.unit_category === 'mass'" value="kg">kg</option><option v-if="item.unit_category === 'volume'" value="L">L</option></select>
                <input type="number" :value="getDisplayValue(item)" @input="e => updateStockFromInput(item, e.target.value)" placeholder="0">
            </div>
        </div>
    </div>

    <div v-if="activeTab === 'recipes'" class="no-print">
        <div v-if="!selectedRecipe">
            <div class="filter-bar">
                <input v-model="recSearch" placeholder="🔍 Search Recipes..." class="search-input">
                <select v-model="recFilterMeal" class="filter-select"><option value="all">All Meals</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select>
                <select v-model="recFilterCat" class="filter-select"><option value="all">All Types</option><option value="main">Main</option><option value="side">Side</option><option value="dessert">Dessert</option></select>
            </div>
            <button v-if="!showRecipeForm" @click="showRecipeForm = true" class="big-btn">➕ Create Recipe</button>
            <div v-if="showRecipeForm" class="card creator-form">
                <h3>New Recipe</h3>
                <input v-model="newRecipe.name" placeholder="Recipe Name" class="full-width">
                <input v-model="newRecipe.servings" placeholder="Servings (e.g. '4 people')" class="full-width">
                <div style="display:flex; gap:10px; margin-bottom:10px;"><select v-model="newRecipe.meal_type" class="full-width"><option value="any">Any Meal</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select><select v-model="newRecipe.dish_category" class="full-width"><option value="other">Category...</option><option value="main">Main</option><option value="side">Side</option><option value="dessert">Dessert</option></select></div>
                <textarea v-model="newRecipe.instructions" placeholder="Instructions..." class="full-width"></textarea>
                <div v-for="(row, i) in newRecipeIngredients" :key="i" class="ing-row">
                    <select v-model="row.inventory_item_id" style="flex:2"><option value="" disabled>Select Ingredient...</option><option v-for="item in inventory" :key="item.id" :value="item.id">{{ item.name }}</option></select>
                    <button @click="showQuickAdd = true" class="btn-small">New?</button>
                    <input type="number" v-model="row.quantity_needed" placeholder="Qty" style="width:60px;">
                    <span v-if="row.inventory_item_id" style="font-size:0.8em; align-self:center;">{{ inventory.find(x => x.id === row.inventory_item_id)?.base_unit }}</span>
                </div>
                <button @click="newRecipeIngredients.push({inventory_item_id:'', quantity_needed:0})" class="btn-secondary full-width">+ Add Line</button>
                <div class="form-actions"><button @click="showRecipeForm=false" class="btn-danger">Cancel</button><button @click="saveNewRecipe" class="btn-success">Save</button></div>
                <div v-if="showQuickAdd" class="quick-add-popup"><h4>Create Ingredient</h4><input v-model="newIngredient.name" placeholder="Name" class="full-width" style="margin-bottom:5px;"><div style="display:flex; gap:5px; margin-bottom:10px;"><select v-model="newIngredient.base_unit" style="flex:1"><option value="g">g</option><option value="ml">ml</option><option value="ea">ea</option></select><select v-model="newIngredient.unit_category" style="flex:1"><option value="mass">Mass</option><option value="volume">Vol</option><option value="count">Count</option></select></div><div style="display:flex; gap:5px;"><button @click="addIngredient" class="btn-success" style="flex:1;">Save</button><button @click="showQuickAdd = false" class="btn-danger" style="flex:1;">Cancel</button></div></div>
            </div>
            <div v-for="recipe in filteredRecipes" :key="recipe.id" class="card recipe-card-clickable" @click="selectedRecipe = recipe">
                <div style="display:flex; justify-content:space-between; align-items: center;"><h3 style="margin:0;">{{ recipe.name }}</h3><div class="tags"><span class="tag">{{ recipe.meal_type }}</span><span class="tag">{{ recipe.dish_category }}</span></div></div>
                <div style="font-size: 0.8em; opacity: 0.7; margin-top: 5px;">Tap to view details ›</div>
            </div>
        </div>
        <div v-else class="detail-view">
            <button @click="selectedRecipe = null" class="back-btn">‹ Back to Menu</button>
            <div class="card" style="margin-top: 20px;">
                <div style="display:flex; justify-content: space-between; align-items:flex-start;"><h2 style="margin-top:0;">{{ selectedRecipe.name }}</h2><button @click="addToPlan(selectedRecipe)" class="add-plan-btn">📝 Add to Plan</button></div>
                <div class="tags" style="margin-bottom: 15px;"><span class="tag">{{ selectedRecipe.meal_type }}</span><span class="tag">{{ selectedRecipe.dish_category }}</span></div>
                <div class="yield-box">Yield: {{ selectedRecipe.servings || 'Not specified' }}</div>
                <h4>Instructions</h4><p class="instruction-box">{{ selectedRecipe.instructions || 'No instructions provided.' }}</p>
                <h4>Ingredients</h4>
                <ul class="ingredient-list"><li v-for="ing in selectedRecipe.recipe_ingredients" :key="ing.id" class="ing-item"><span v-if="ing.inventory_items"><strong>{{ ing.inventory_items.name }}</strong><span style="float: right;">{{ ing.quantity_needed }} {{ ing.inventory_items.base_unit }}</span></span></li></ul>
            </div>
        </div>
    </div>

    <div v-if="activeTab === 'planner'" class="no-print">
        <div class="export-bar">
            <button @click="triggerPrint('shopping')" class="export-btn btn-danger">🖨️ Export Grocery List</button>
            <button @click="triggerPrint('recipes')" class="export-btn btn-blue">🖨️ Export Recipe Pack</button>
        </div>
        <div class="filter-bar">
            <input v-model="planSearch" placeholder="🔍 Search Plan..." class="search-input">
            <select v-model="planFilterMeal" class="filter-select"><option value="all">All Meals</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select>
            <select v-model="planFilterCat" class="filter-select"><option value="all">All Types</option><option value="main">Main</option><option value="side">Side</option></select>
        </div>
        <div class="card planner-card">
            <h3>Production Plan</h3>
            <p v-if="plannerList.length === 0" style="opacity: 0.7; font-style:italic;">Your plan is empty.</p>
            <div v-for="recipe in filteredPlanRecipes" :key="recipe.id" class="plan-row">
                <div><strong>{{ recipe.name }}</strong><br><small style="opacity: 0.7;">Yield: {{ recipe.servings }}</small></div>
                <div style="display:flex; align-items:center; gap:10px;"><div><span style="font-size:0.8em; opacity: 0.7; margin-right:5px;">Batches:</span><input type="number" v-model="productionPlan[recipe.id]" placeholder="0" style="width:50px; padding:5px;"></div><button @click="removeFromPlan(recipe.id)" class="remove-btn">×</button></div>
            </div>
        </div>
        <div v-if="shoppingList.length > 0" class="card shopping-card">
            <h3>Shopping List Preview</h3>
            <table><tr v-for="i in shoppingList" :key="i.name"><td>{{ i.name }}</td><td class="shopping-amount">{{ i.order }}{{ i.unit }}</td></tr></table>
        </div>
    </div>

    <div v-if="printMode === 'shopping'" class="print-container">
        <div class="print-header"><h1>Grocery List</h1><p>Generated: {{ new Date().toLocaleDateString() }}</p></div>
        <table class="print-table"><thead><tr><th>Item</th><th style="text-align:right;">Order Amount</th><th style="text-align:center;">Check</th></tr></thead><tbody><tr v-for="item in shoppingList" :key="item.name"><td>{{ item.name }}</td><td style="text-align:right;">{{ item.order }} {{ item.unit }}</td><td style="text-align:center; color: #ccc;">[ &nbsp;&nbsp; ]</td></tr></tbody></table>
    </div>
    <div v-if="printMode === 'recipes'" class="print-container">
        <div class="print-header"><h1>Kitchen Prep Pack</h1><p>{{ new Date().toLocaleDateString() }}</p></div>
        <div v-for="recipe in printRecipePack" :key="recipe.id" class="print-recipe-block">
            <div style="border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 15px;"><h2 style="margin:0; font-size: 24px;">{{ recipe.name }}</h2><div style="font-size: 14px; margin-top: 5px;"><strong>Plan:</strong> {{ recipe.batches }} Batches<span style="margin: 0 10px;">|</span><strong>Base Yield:</strong> {{ recipe.servings }}</div></div>
            <div style="display:flex; gap: 30px;"><div style="flex: 1;"><h3>Ingredients (Scaled x{{ recipe.batches }})</h3><ul style="list-style: none; padding: 0;"><li v-for="ing in recipe.scaledIngredients" :key="ing.name" style="padding: 4px 0; border-bottom: 1px solid #ddd;"><strong>{{ ing.amount }} {{ ing.unit }}</strong> {{ ing.name }} </li></ul></div><div style="flex: 1;"><h3>Instructions</h3><p style="white-space: pre-wrap; line-height: 1.4;">{{ recipe.instructions || 'No instructions provided.' }}</p></div></div><div class="page-break"></div>
        </div>
    </div>
    <button v-if="printMode" @click="printMode = null" class="close-print-btn no-print">❌ Close Print View</button>
  </div>
</template>

<style>
/* CSS VARIABLES (THEME LOGIC) */
:root {
  /* LIGHT MODE (Default) */
  --bg-app: #f1f5f9;
  --bg-card: #ffffff;
  --bg-input: #ffffff;
  --bg-highlight: #eff6ff;
  --bg-highlight-border: #bfdbfe;
  --bg-planner: #fffbeb;
  --text-main: #1e293b;
  --text-muted: #64748b;
  --border-color: #e2e8f0;
  
  --color-primary: #3b82f6;
  --color-success: #22c55e;
  --color-danger: #ef4444;
  --color-warning: #fbbf24;
}

@media (prefers-color-scheme: dark) {
  :root {
    /* DARK MODE OVERRIDES */
    --bg-app: #0f172a;
    --bg-card: #1e293b;
    --bg-input: #334155;
    --bg-highlight: #172554;
    --bg-highlight-border: #1e3a8a;
    --bg-planner: #422006;
    --text-main: #f1f5f9;
    --text-muted: #94a3b8;
    --border-color: #475569;
  }
}

/* BASE STYLES */
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: var(--bg-app); color: var(--text-main); margin: 0; padding-bottom: 60px; transition: background 0.3s, color 0.3s; }
.app-container { max-width: 600px; margin: 0 auto; padding: 15px; }
h1, h2, h3, h4 { color: var(--text-main); }
input, select, textarea { background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); }

/* LAYOUT & CARDS */
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.header h1 { text-align: center; width: 100%; margin: 0; }
.logout-btn { background: transparent; border: 1px solid var(--text-muted); color: var(--text-main); padding: 5px 10px; border-radius: 4px; cursor: pointer; }

.card { background: var(--bg-card); padding: 15px; margin-bottom: 12px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); position: relative; }

/* TABS */
.tabs { display: flex; gap: 8px; margin-bottom: 15px; }
.tabs button { flex: 1; padding: 12px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; background: var(--border-color); color: var(--text-muted); transition: all 0.2s; }
.tabs button.active { background: var(--color-primary); color: white; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3); }
.planner-tab-btn { background: var(--color-warning) !important; color: black !important; }

/* FILTERS & INPUTS */
.filter-bar { display: flex; gap: 8px; margin-bottom: 15px; }
.search-input { flex: 2; padding: 10px; border-radius: 6px; }
.filter-select { flex: 1; padding: 10px; border-radius: 6px; }

/* BUTTONS */
.save-btn { width: 100%; padding: 15px; background: var(--color-success); color: white; font-weight: bold; border: none; border-radius: 8px; margin-bottom: 15px; cursor: pointer; position: sticky; top: 10px; z-index: 99; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
.btn-blue { background: var(--color-primary); color: white; border: none; border-radius: 4px; padding: 0 15px; cursor: pointer; }
.btn-success { background: var(--color-success); color: white; border: none; border-radius: 4px; padding: 10px; cursor: pointer; }
.btn-danger { background: var(--color-danger); color: white; border: none; border-radius: 4px; padding: 10px; cursor: pointer; }
.btn-secondary { background: var(--text-muted); color: white; border: none; border-radius: 4px; padding: 10px; cursor: pointer; }
.btn-small { padding: 5px; background: var(--text-muted); color: white; border-radius: 4px; border: none; cursor: pointer; }
.big-btn { width: 100%; padding: 12px; background: var(--color-primary); color: white; border: none; border-radius: 8px; font-weight: bold; margin-bottom: 15px; cursor: pointer; }
.full-width { width: 100%; box-sizing: border-box; padding: 10px; margin-bottom: 10px; border-radius: 4px; }

/* INVENTORY */
.add-box { background: var(--bg-highlight); border: 1px solid var(--bg-highlight-border); }
.inventory-row { background: var(--bg-card); padding: 12px; margin-bottom: 8px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.row-inputs { display: flex; gap: 5px; align-items: center; }
.unit-toggle { padding: 8px; border-radius: 6px; font-size: 0.9em; }
.inventory-row input[type="number"] { width: 90px; padding: 8px; text-align: right; border-radius: 6px; font-size: 1.1em; font-weight: bold; }

/* RECIPES */
.recipe-card-clickable { cursor: pointer; transition: transform 0.1s; border-left: 5px solid transparent; }
.recipe-card-clickable:hover { transform: translateY(-2px); }
.recipe-card-clickable:active { transform: scale(0.98); }
.tags { display: flex; gap: 5px; }
.tag { font-size: 0.75em; background: var(--border-color); padding: 2px 6px; border-radius: 4px; color: var(--text-muted); text-transform: uppercase; font-weight: bold; }
.detail-view { background: var(--bg-app); min-height: 80vh; }
.back-btn { background: var(--text-muted); color: white; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; margin-bottom: 10px; }
.yield-box { background: var(--bg-highlight); padding: 10px; border-radius: 5px; margin-bottom: 20px; color: var(--color-primary); font-weight: bold; }
.instruction-box { white-space: pre-wrap; line-height: 1.5; background: var(--bg-app); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); }
.ingredient-list li { padding: 5px 0; border-bottom: 1px dashed var(--border-color); }
.add-plan-btn { background: var(--color-warning); color: black; border: none; padding: 10px; border-radius: 5px; cursor: pointer; font-weight: bold; }
.quick-add-popup { background: var(--bg-card); border: 2px solid var(--color-warning); padding: 15px; position: absolute; width: 85%; left: 5%; top: 60px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 1000; border-radius: 8px; }

/* PLANNER */
.planner-card { border-left: 5px solid var(--color-warning); }
.plan-row { margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; background: var(--bg-highlight); padding: 10px; border-radius: 8px; }
.remove-btn { background: var(--color-danger); color: white; width: 30px; height: 30px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; }
.shopping-card { border-left: 5px solid var(--color-danger); }
.shopping-amount { color: var(--color-danger); font-weight: bold; }

/* EXPORT / PRINT */
.export-bar { display: flex; gap: 10px; margin-bottom: 15px; }
.export-btn { flex: 1; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.print-container { background: white; color: black; padding: 40px; position: absolute; top: 0; left: 0; width: 100%; min-height: 100vh; z-index: 9999; box-sizing: border-box; }
.print-header { text-align: center; border-bottom: 2px solid #333; margin-bottom: 30px; }
.print-table { width: 100%; border-collapse: collapse; }
.print-table th, .print-table td { border-bottom: 1px solid #ccc; padding: 10px; text-align: left; color: black; }
.print-recipe-block { margin-bottom: 50px; break-inside: avoid; page-break-inside: avoid; color: black; }
.page-break { page-break-after: always; }
.close-print-btn { position: fixed; bottom: 20px; right: 20px; background: #333; color: white; padding: 15px 30px; border-radius: 30px; font-weight: bold; z-index: 10000; cursor: pointer; box-shadow: 0 5px 15px rgba(0,0,0,0.3); border:none; }
.auth-container { max-width: 400px; margin-top: 50px; }
.loading-screen { text-align: center; padding: 50px; color: var(--text-muted); }

/* FORCE PRINT TO LIGHT MODE */
@media print {
  .no-print { display: none !important; }
  .print-container { position: static; width: 100%; height: auto; overflow: visible; background: white; color: black; }
  body { background: white; color: black; -webkit-print-color-adjust: exact; }
  .app-container { max-width: 100%; margin: 0; padding: 0; }
  .close-print-btn { display: none !important; }
}
</style>