import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import Navbar from './Components/Navbar';
import Signin from './Components/Signin';
import Signup from './Components/Signup';
import Clubs from './Components/Clubs';
import Players from './Components/Players';
import Schedule from './Components/Schedule';
import Standing from './Components/Standing';
import DashBoard from './Components/DashBoard';
import LiveScore from './Components/Livescore';
import ClubDetails from './Components/ClubDetails ';
import PlayerDetails from './Components/PlayerDetails';
import ViewNews from './Components/ViewNews';
import NewsDetails from './Components/NewsDetails';
import ScoreTracking from './Components/ScoreTracking';
import Transfer from './Components/Transfer';
import ManageGroups from './Components/ManageGroups';
import Statistics from './Components/Statistics';


function App() {
  return (
    <div className="App">

      

      <BrowserRouter>
      <Navbar/>
     
        <Routes>
          <Route path='/signin' element={<Signin/>}/>
          <Route path='/signup' element={<Signup/>}/>
          <Route path='/clubs' element={<Clubs/>}/>
          <Route path='/players' element={<Players/>}/>
          <Route path='/schedule' element={<Schedule/>}/>
          <Route path='/standing' element={<Standing/>}/>
          <Route path='/' element={<DashBoard/>}/>
          <Route path='/livescore' element={<LiveScore/>}/>
          <Route path="/club/:id" element={<ClubDetails/>}/>
          <Route path='/player/:id' element={<PlayerDetails/>}/>
          <Route path="/viewnews" element={<ViewNews/>}/>
          <Route path='/newsdetails/:id' element={<NewsDetails/>}/>
          <Route path='/score' element={<ScoreTracking/>}/>
          <Route path='/transfer' element={<Transfer/>}/>
          <Route path="/admin/groups" element={<ManageGroups />} />
          <Route path="/stats" element={<Statistics />} />


        </Routes>
     
      
      </BrowserRouter>

     
      
    </div>
  );
}

export default App;
