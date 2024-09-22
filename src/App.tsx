import { ParentProps, Show, type Component } from 'solid-js';
import Search from './Search';
import Review from './Review';

import styles from "./App.module.css";
import { DictProvider, useDictStatus } from './dict/dict';
import { Route, Router } from '@solidjs/router';
import { SrsProvider } from './srs/srs';
import Header from './Header';
import Home from './Home';

const App: Component = () => {
  return (
    <Router root={Root}>
      <Route path="/" component={Home} />
      <Route path="/search" component={Search} />
      <Route path="/review" component={Review} />
    </Router>
  );
};

const Root: Component<ParentProps> = (props) => {
  return (
    <DictProvider>
      <SrsProvider>
        <LoadingGate>
          <div class={styles.Root}>
            <Header />
            {props.children}
          </div>
        </LoadingGate>
      </SrsProvider>
    </DictProvider>
  )
};

const LoadingGate: Component<ParentProps> = (props) => {
  const status = useDictStatus();

  return (
    <>
      {(() => {
        const s = status();
        if (s.status === "loading") {
          return (
            <div class={styles.Loading}>
              <p>Loading...</p>
              <Show when={s.words !== 0}>
                <p>{s.words} words imported</p>
              </Show>
            </div>
          );
        } else if (s.status === "failure") {
          return (
            <div class={styles.Failure}>
              Something went wrong. Try refreshing the page.
            </div>
          );
        } else {
          return props.children;
        }
      })()}
    </>
  );
};

export default App;
