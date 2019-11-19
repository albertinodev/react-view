import * as React from 'react';
import copy from 'copy-to-clipboard';
import debounce from 'lodash/debounce';
import * as t from '@babel/types';

// transformations, code generation
import {transformBeforeCompilation} from './ast';
import {getCode, formatCode} from './code-generator';
import {buildPropsObj} from './utils';
import {TPropValue, TError, TUseView} from './types';

// actions that can be dispatched
import {
  reset,
  updateAll,
  updateCode,
  updateCodeAndProvider,
  updateProps,
  updatePropsAndCode,
  updatePropsAndCodeNoRecompile,
} from './actions';
import reducer from './reducer';

const useView: TUseView = (config = {}) => {
  // setting defaults
  const componentName = config.componentName ? config.componentName : '';
  const propsConfig = config.props ? config.props : {};
  const scopeConfig = config.scope ? config.scope : {};
  const importsConfig = config.imports ? config.imports : {};
  const provider = config.provider
    ? config.provider
    : {
        value: undefined,
        parse: () => undefined,
        generate: (_: any, child: any) => child,
        imports: {},
      };
  const onUpdate = config.onUpdate ? config.onUpdate : () => {};
  const customProps = config.customProps ? config.customProps : {};
  const initialCode = config.initialCode;

  const [hydrated, setHydrated] = React.useState(false);
  const [error, setError] = React.useState<TError>({where: '', msg: null});
  const [state, dispatch] = React.useReducer(reducer, {
    code:
      initialCode ||
      getCode({
        props: propsConfig,
        componentName,
        provider,
        providerValue: provider.value,
        importsConfig,
        customProps,
      }),
    codeNoRecompile: '',
    props: propsConfig,
    providerValue: provider ? provider.value : undefined,
  });

  // initialize from the initialCode
  React.useEffect(() => {
    if (initialCode && !hydrated) {
      setHydrated(true);
      try {
        updateAll(
          dispatch,
          initialCode,
          componentName,
          propsConfig,
          provider ? provider.parse : undefined,
          customProps
        );
      } catch (e) {}
    }
  }, [initialCode]);

  // this callback is secretely inserted into props marked with
  // "propHook" this way we can get notified when the internal
  // state of previewed component is changed by user
  const __react_view_onChange = debounce((propValue: TPropValue, propName: string) => {
    !hydrated && setHydrated(true);
    const newCode = getCode({
      props: buildPropsObj(state.props, {[propName]: propValue}),
      componentName,
      provider,
      providerValue: state.providerValue,
      importsConfig,
      customProps,
    });
    updatePropsAndCodeNoRecompile(dispatch, newCode, propName, propValue);
    onUpdate({code: newCode});
  }, 200);

  return {
    compilerProps: {
      code: state.code,
      setError: (msg: string | null) => setError({where: '__compiler', msg}),
      transformations: [
        (ast: t.File) => transformBeforeCompilation(ast, componentName, propsConfig),
      ],
      scope: {
        ...scopeConfig,
        __react_view_onChange,
      },
    },
    knobProps: {
      state: state.props,
      error,
      set: (propValue: TPropValue, propName: string) => {
        try {
          !hydrated && setHydrated(true);
          const newCode = getCode({
            props: buildPropsObj(state.props, {[propName]: propValue}),
            componentName,
            provider,
            providerValue: state.providerValue,
            importsConfig,
            customProps,
          });
          setError({where: '', msg: null});
          updatePropsAndCode(dispatch, newCode, propName, propValue);
          onUpdate({code: newCode});
        } catch (e) {
          updateProps(dispatch, propName, propValue);
          setError({where: propName, msg: e.toString()});
        }
      },
    },
    providerValue: state.providerValue,
    editorProps: {
      code: state.codeNoRecompile !== '' ? state.codeNoRecompile : state.code,
      onChange: (newCode: string) => {
        try {
          updateAll(
            dispatch,
            newCode,
            componentName,
            propsConfig,
            provider ? provider.parse : undefined,
            customProps
          );
          onUpdate({code: newCode});
        } catch (e) {
          updateCode(dispatch, newCode);
        }
      },
    },
    errorProps: {
      msg: error.where === '__compiler' ? error.msg : null,
      code: state.code,
    },
    actions: {
      formatCode: () => {
        updateCode(dispatch, formatCode(state.code));
      },
      copyCode: () => {
        copy(state.code);
      },
      copyUrl: () => {
        copy(window.location.href);
      },
      reset: () => {
        reset(
          dispatch,
          initialCode ||
            getCode({
              props: propsConfig,
              componentName,
              provider,
              providerValue: state.providerValue,
              importsConfig,
              customProps,
            }),
          propsConfig
        );
      },
      updateProvider: (providerValue: any) => {
        const newCode: string = getCode({
          props: buildPropsObj(state.props, {}),
          componentName,
          provider,
          providerValue,
          importsConfig,
          customProps,
        });
        updateCodeAndProvider(dispatch, newCode, providerValue);
      },
      updateProp: (propName: string, propValue: any) => {
        try {
          const newCode = getCode({
            props: buildPropsObj(state.props, {[propName]: propValue}),
            componentName,
            provider,
            providerValue: state.providerValue,
            importsConfig,
            customProps,
          });
          setError({where: '', msg: null});
          updatePropsAndCode(dispatch, newCode, propName, propValue);
        } catch (e) {
          updateProps(dispatch, propName, propValue);
          setError({where: propName, msg: e.toString()});
        }
      },
    },
  };
};

export default useView;
