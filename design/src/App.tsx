export default function App() {
  return (
    <iframe
      className="app-frame"
      src={`${import.meta.env.BASE_URL}vote.html`}
      title="VOTE - Democratic Decision & Battle Platform"
    />
  )
}
