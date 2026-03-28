/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Discovery } from './pages/Discovery';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { Details } from './pages/Details';
import { Reader } from './pages/Reader';
import { Bookshelf } from './pages/Bookshelf';
import { Player } from './pages/Player';
import { ComicViewer } from './pages/ComicViewer';
import { CacheManager } from './pages/CacheManager';

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/discovery" element={<Discovery />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/bookshelf" element={<Bookshelf />} />
          <Route path="/cache" element={<CacheManager />} />
          <Route path="/details/:id" element={<Details />} />
          <Route path="/reader/:id" element={<Reader />} />
          <Route path="/player/:id" element={<Player />} />
          <Route path="/comic/:id" element={<ComicViewer />} />
        </Routes>
      </Layout>
    </Router>
  );
}
