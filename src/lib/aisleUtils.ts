export const AISLE_LABELS: Record<number, string> = {
  1: '🥦 Produce',
  2: '🥩 Meat & Fish',
  3: '🥛 Dairy & Eggs',
  4: '🥫 Canned & Dry',
  5: '🫒 Oils & Spices',
  6: '🧃 Beverages',
  7: '🛒 Other',
}

/** Silently assign aisle sort order from ingredient name/emoji.
 *  1=Produce  2=Meat&Seafood  3=Dairy&Eggs  4=Canned&Packaged
 *  5=Oils&Spices  6=Beverages  7=Other */
export function detectAisleOrder(name: string, emoji: string | null): number {
  const n = name.toLowerCase()

  if (/\b(coffee|tea|juice|water|soda|beer|wine|drink|beverage|kombucha)\b/.test(n)) return 6

  if (/\b(oil|vinegar|sauce|spice|salt|pepper|cumin|coriander|turmeric|paprika|cinnamon|bay|oregano|thyme|rosemary|sumac|urfa|zaatar|garam|masala|seasoning|powder|ground|dried|chili|chilli|cayenne|cardamom|clove|nutmeg|saffron|vanilla|extract)\b/.test(n)) return 5

  if (/\b(canned|can|paste|broth|stock|beans|lentils|pasta|rice|flour|sugar|honey|syrup|coconut milk|tomato|noodle|cereal|cracker|bread|tortilla|wrap|oat|barley|quinoa|couscous|panko|breadcrumb)\b/.test(n)) return 4

  if (/\b(milk|cheese|yogurt|cream|butter|egg|eggs|ghee|paneer|kefir|ricotta|mozzarella|parmesan|feta|brie|cheddar|whey|dairy|sour cream|cream cheese|half[- ]and[- ]half)\b/.test(n)) return 3

  if (/\b(chicken|beef|lamb|pork|fish|shrimp|salmon|tuna|turkey|meat|sausage|bacon|steak|ground|fillet|prawn|cod|tilapia|mahi|halibut|trout|crab|lobster|scallop|anchov|sardine|duck|veal|bison|venison)\b/.test(n)) return 2

  if (/\b(onion|garlic|lemon|lime|tomato|pepper|potato|carrot|celery|spinach|lettuce|apple|banana|berry|ginger|cilantro|parsley|basil|mint|cucumber|zucchini|eggplant|mushroom|avocado|mango|orange|grape|pear|plum|peach|cherry|kale|arugula|fennel|leek|shallot|scallion|chard|beet|radish|asparagus|corn|pea|edamame|squash|cauliflower|broccoli|cabbage|bok choy)\b/.test(n)) return 1

  // Emoji-based fallback
  const emojiAisle: Record<string, number> = {
    '🥬': 1, '🥦': 1, '🥕': 1, '🧅': 1, '🧄': 1, '🍋': 1, '🥑': 1, '🌿': 1, '🌶': 1, '🥒': 1, '🍅': 1, '🫑': 1,
    '🥩': 2, '🍖': 2, '🐟': 2, '🦐': 2, '🍗': 2, '🥓': 2,
    '🥛': 3, '🧀': 3, '🥚': 3, '🧈': 3,
    '🥫': 4, '🫘': 4,
    '🫙': 5, '🧂': 5,
    '☕': 6, '🍵': 6, '🧃': 6,
  }
  if (emoji && emojiAisle[emoji]) return emojiAisle[emoji]

  return 7
}
