import { Screen } from '../components/layout/Screen'

export function RecipesScreen() {
  return (
    <Screen>
      <div style={{ padding: '20px 16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 4px' }}>
          Recipes
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--ts)', margin: 0 }}>
          Coming in Session 2
        </p>
      </div>
    </Screen>
  )
}
