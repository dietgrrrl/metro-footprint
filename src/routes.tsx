import { createHashRouter } from 'react-router';
import Layout from './components/Layout';
import Home from './pages/Home';
import CityDetail from './pages/CityDetail';
import Admin from './pages/Admin';

export const router = createHashRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: 'city/:id', Component: CityDetail },
      { path: 'admin', Component: Admin },
    ],
  },
]);
