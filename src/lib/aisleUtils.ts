export const AISLE_LABELS: Record<number, string> = {
  1:  '🥦 Produce',
  2:  '🥩 Meat & Fish',
  3:  '🧊 Frozen',
  4:  '🍿 Snacks',
  5:  '🥫 Canned & Dry',
  6:  '🫒 Oils & Spices',
  7:  '🥛 Dairy & Eggs',
  8:  '🍞 Bread & Bakery',
  9:  '🥪 Deli & Prepared',
  10: '🧃 Beverages',
  11: '🧹 Household',
  12: '🛒 Other',
}

/** Plain names without emoji — for display next to aisle images */
export const AISLE_NAMES: Record<number, string> = {
  1:  'Produce',
  2:  'Meat & Fish',
  3:  'Frozen',
  4:  'Snacks',
  5:  'Canned & Dry',
  6:  'Oils & Spices',
  7:  'Dairy & Eggs',
  8:  'Bread & Bakery',
  9:  'Deli & Prepared',
  10: 'Beverages',
  11: 'Household',
  12: 'Other',
}

/** Silently assign aisle sort order from ingredient name/emoji.
 *  1=Produce  2=Meat&Fish  3=Frozen  4=Snacks  5=Canned&Dry
 *  6=Oils&Spices  7=Dairy&Eggs  8=Bread&Bakery  9=Deli&Prepared
 *  10=Beverages  11=Household  12=Other */
export function detectAisleOrder(name: string, emoji: string | null): number {
  const n = name.toLowerCase()

  // Household first — avoids false-positive matches on ingredient words
  if (/\b(paper towel|toilet paper|dish soap|laundry|detergent|bleach|sponge|trash bag|garbage bag|ziploc|ziplock|foil|plastic wrap|parchment|wax paper|napkin|tissue|cleaning|cleaner|scrub|mop|broom|hand soap|dish wash|dishwash)\b/.test(n)) return 11

  // Frozen
  if (/\b(frozen|ice cream|gelato|sorbet|popsicle|edamame frozen|frozen pea|frozen corn|frozen berry|frozen spinach|ice|freezer)\b/.test(n)) return 3

  // Deli & Prepared
  if (/\b(deli|hummus|rotisserie|prepared|salad kit|cooked|pre[- ]made|ready[- ]to[- ]eat|lunch meat|lunchmeat|prosciutto|salami|pepperoni|mortadella|pastrami|corned beef|bologna|liverwurst|pâté|pate|smoked salmon)\b/.test(n)) return 9

  // Bread & Bakery
  if (/\b(bread|baguette|loaf|roll|bun|bagel|muffin|croissant|pita|naan|tortilla|wrap|lavash|flatbread|sourdough|rye|focaccia|brioche|challah|english muffin|panko|breadcrumb|bread crumb|crouton|cake|cupcake|pastry|pie crust|phyllo|puff pastry|dough)\b/.test(n)) return 8

  // Snacks
  if (/\b(chip|crisp|cracker|popcorn|pretzel|granola bar|energy bar|protein bar|trail mix|nut bar|rice cake|pita chip|tortilla chip|cookie|biscuit|snack)\b/.test(n)) return 4

  // Beverages
  if (/\b(coffee|tea|juice|water|soda|beer|wine|drink|beverage|kombucha|oat milk|almond milk|soy milk|coconut water|sparkling)\b/.test(n)) return 10

  // Oils & Spices
  if (/\b(oil|vinegar|sauce|spice|salt|pepper|cumin|coriander|turmeric|paprika|cinnamon|bay|oregano|thyme|rosemary|sumac|urfa|zaatar|garam|masala|seasoning|powder|ground|dried|chili|chilli|cayenne|cardamom|clove|nutmeg|saffron|vanilla|extract|mustard|ketchup|mayo|mayonnaise|hot sauce|soy sauce|fish sauce|worcestershire|sriracha|tahini|miso|hoisin|oyster sauce)\b/.test(n)) return 6

  // Canned & Dry
  if (/\b(canned|can|paste|broth|stock|beans|lentils|pasta|rice|flour|sugar|honey|syrup|coconut milk|tomato sauce|noodle|cereal|oat|oats|barley|quinoa|couscous|chickpea|lentil|black bean|kidney bean|chickpeas)\b/.test(n)) return 5

  // Dairy & Eggs
  if (/\b(milk|cheese|yogurt|cream|butter|egg|eggs|ghee|paneer|kefir|ricotta|mozzarella|parmesan|feta|brie|cheddar|whey|dairy|sour cream|cream cheese|half[- ]and[- ]half|heavy cream|crème fraîche)\b/.test(n)) return 7

  // Meat & Fish
  if (/\b(chicken|beef|lamb|pork|fish|shrimp|salmon|tuna|turkey|meat|sausage|bacon|steak|ground|fillet|prawn|cod|tilapia|mahi|halibut|trout|crab|lobster|scallop|anchov|sardine|duck|veal|bison|venison|rib|rack|chop|tenderloin|brisket|flank|skirt)\b/.test(n)) return 2

  // Produce
  if (/\b(onion|garlic|lemon|lime|tomato|pepper|potato|carrot|celery|spinach|lettuce|apple|banana|berry|ginger|cilantro|parsley|basil|mint|cucumber|zucchini|eggplant|mushroom|avocado|mango|orange|grape|pear|plum|peach|cherry|kale|arugula|fennel|leek|shallot|scallion|chard|beet|radish|asparagus|corn|pea|squash|cauliflower|broccoli|cabbage|bok choy|herb|fresh|produce|vegetable|fruit|jalapeño|serrano|habanero)\b/.test(n)) return 1

  // Emoji-based fallback
  const emojiAisle: Record<string, number> = {
    '🥬': 1, '🥦': 1, '🥕': 1, '🧅': 1, '🧄': 1, '🍋': 1, '🥑': 1, '🌿': 1, '🌶': 1, '🥒': 1, '🍅': 1, '🫑': 1, '🍎': 1, '🍌': 1,
    '🥩': 2, '🍖': 2, '🐟': 2, '🦐': 2, '🍗': 2, '🥓': 2,
    '🧊': 3,
    '🍿': 4, '🧁': 4,
    '🥫': 5, '🫘': 5,
    '🫙': 6, '🧂': 6,
    '🥛': 7, '🧀': 7, '🥚': 7, '🧈': 7,
    '🍞': 8, '🥖': 8, '🥐': 8, '🫓': 8, '🥯': 8,
    '☕': 10, '🍵': 10, '🧃': 10,
  }
  if (emoji && emojiAisle[emoji]) return emojiAisle[emoji]

  return 12
}

export const AISLE_IMAGES: Record<number, string | null> = {
  1:  'https://prxexzcyfcwvdhjrcwfw.supabase.co/storage/v1/object/public/ingredient-images/aisle-1.png',
  2:  'https://prxexzcyfcwvdhjrcwfw.supabase.co/storage/v1/object/public/ingredient-images/aisle-2.png',
  3:  'https://prxexzcyfcwvdhjrcwfw.supabase.co/storage/v1/object/public/ingredient-images/aisle-3.png',
  4:  'https://prxexzcyfcwvdhjrcwfw.supabase.co/storage/v1/object/public/ingredient-images/aisle-4.png',
  5:  'https://prxexzcyfcwvdhjrcwfw.supabase.co/storage/v1/object/public/ingredient-images/aisle-5.png',
  6:  'https://prxexzcyfcwvdhjrcwfw.supabase.co/storage/v1/object/public/ingredient-images/aisle-6.png',
  7:  'https://prxexzcyfcwvdhjrcwfw.supabase.co/storage/v1/object/public/ingredient-images/aisle-7.png',
  8:  'https://prxexzcyfcwvdhjrcwfw.supabase.co/storage/v1/object/public/ingredient-images/aisle-8.png',
  9:  'https://prxexzcyfcwvdhjrcwfw.supabase.co/storage/v1/object/public/ingredient-images/aisle-9.png',
  10:  'https://prxexzcyfcwvdhjrcwfw.supabase.co/storage/v1/object/public/ingredient-images/aisle-10.png',
  11:  'https://prxexzcyfcwvdhjrcwfw.supabase.co/storage/v1/object/public/ingredient-images/aisle-11.png',
  12:  'https://prxexzcyfcwvdhjrcwfw.supabase.co/storage/v1/object/public/ingredient-images/aisle-12.png',
}
