import './App.css'
import Navbar from './components/Navbar'
import {useState, useEffect} from 'react'

function App() {

  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className='min-h-screen bg-ui-bg flex flex-col'>
      <Navbar theme={theme} setTheme={setTheme}></Navbar>
    </div>
  )
}

export default App
