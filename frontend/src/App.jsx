import './App.css'

import Navbar from './components/Navbar'
import Signup from './components/Signup'
import Home from './components/Home'
import Login from './components/Login'
import ProfilePage from './components/ProfilePage'
import AccountsPage from './components/AccountsPage'
import NewTransactionPage from './components/NewTransactionPage'

import {useState, useEffect} from 'react'
import {BrowserRouter as Router, Route, Routes} from 'react-router-dom'

function App() {

  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <Router>
      <div className='min-h-screen bg-ui-bg flex flex-col'>
        <Navbar theme={theme} setTheme={setTheme}></Navbar>
        <div className='flex justify-center m-10'>
          <Routes>
            <Route path="/sign-up" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/transactions/new" element={<NewTransactionPage />} />
            <Route path="/" element={<Home />} />
          </Routes>
        </div>
        
      </div>
    </Router>
  )
}

export default App
