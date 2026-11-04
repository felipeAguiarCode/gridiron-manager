import { createHashRouter, Navigate } from 'react-router-dom'
import { MainMenuScreen } from './screens/MainMenuScreen'
import { NewCareerScreen } from './screens/NewCareerScreen'
import { GameLayout } from './screens/GameLayout'
import { HomeScreen } from './screens/HomeScreen'
import { OfficeScreen } from './screens/OfficeScreen'
import { RosterScreen } from './screens/RosterScreen'
import { CompetitionScreen } from './screens/CompetitionScreen'
import { CalendarScreen } from './screens/CalendarScreen'
import { GameDayScreen } from './screens/GameDayScreen'
import { MarketScreen } from './screens/MarketScreen'
import { ScoutsScreen } from './screens/ScoutsScreen'
import { EspnScreen } from './screens/EspnScreen'
import { DraftScreen } from './screens/DraftScreen'
import { PreseasonScreen } from './screens/PreseasonScreen'
import { EditorScreen } from './screens/EditorScreen'
import { PlaybookHubScreen } from './screens/PlaybookHubScreen'

export const router = createHashRouter([
  { path: '/', element: <MainMenuScreen /> },
  { path: '/new-career', element: <NewCareerScreen /> },
  { path: '/game-day/:gameId', element: <GameDayScreen /> },
  {
    path: '/game',
    element: <GameLayout />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'office', element: <OfficeScreen /> },
      { path: 'roster', element: <RosterScreen /> },
      { path: 'competition', element: <CompetitionScreen /> },
      { path: 'calendar', element: <CalendarScreen /> },
      { path: 'market', element: <MarketScreen /> },
      { path: 'scouts', element: <ScoutsScreen /> },
      { path: 'espn', element: <EspnScreen /> },
      { path: 'feed', element: <Navigate to="/game/espn" replace /> },
      { path: 'news', element: <Navigate to="/game/espn" replace /> },
      { path: 'draft', element: <DraftScreen /> },
      { path: 'preseason', element: <PreseasonScreen /> },
      { path: 'playbooks', element: <PlaybookHubScreen /> },
      { path: 'editor', element: <EditorScreen /> }
    ]
  }
])
