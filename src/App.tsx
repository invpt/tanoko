import { ParentProps, Show, type Component } from "solid-js";
import Search from "./Search";
import Review from "./Review";

import styles from "./App.module.css";
import { useDictStatus } from "./dict/dict";
import { Route, Router } from "@solidjs/router";
import { SrsProvider } from "./srs/srs";
import Header from "./Header";
import Home from "./Home";
import Settings from "./Settings";

const App: Component = () => {
  return (
    <Router root={Root}>
      <Route path="/" component={Home} />
      <Route path="/search" component={Search} />
      <Route path="/review" component={Review} />
      <Route path="/settings" component={Settings} />
    </Router>
  );
};

const Root: Component<ParentProps> = (props) => {
  return (
    <SrsProvider>
      <div class={styles.Root}>
        <Header />
        {props.children}
      </div>
    </SrsProvider>
  );
};

export default App;
