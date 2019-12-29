import { Observable, merge, fromEvent, of, timer, EMPTY } from 'rxjs';
import {
  mapTo,
  mergeAll,
  share,
  filter,
  map,
  mergeMap,
  scan,
  tap,
  takeUntil,
  startWith
} from 'rxjs/operators';
import { Decimal } from 'decimal.js';
import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';

/**
 * 소수점이 존재하는 경우에 정수 부분만 ,를 적용한다.
 */
function numberWithCommas(x: string | number) {
  if (typeof x !== 'string') {
      x = x.toString();
  }
  const parts = x.split('.');
  // parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  parts[0] = new Intl.NumberFormat().format(parseInt(parts[0], 10));
  return parts.join('.');
}

//
//    1 + 1   + 1   +
// => 1 + 1 = + 1 = +
//    1 + 1 =    1 + 1 =
// => 1 + 1 = AC 1 + 1 =
//    1 + 1 = 3     = 4     =
// => 1 + 1 = 3 + 1 = 4 + 1 =

const enum KeyType {
  Number,   // Zero, ..., Nine, Point, PlusMinus, Percent
  Operator, // Add, Substract, Multiply, Divide
  Clear,    // C
  Enter     // Enter
}

const enum KeyValue {
  Zero = 0,
  One,
  Two,
  Three,
  Four,
  Five,
  Six,
  Seven,
  Eight,
  Nine,
  Point,
  PlusMinus,
  Percent,
  Add,
  Subtract,
  Multiply,
  Divide,
  C,
  Enter
}

const enum Step {
  WaitFirst,
  ChangeFirst,
  WaitSecond,
  ChangeSecond
}

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.component.html',
  styleUrls: ['./calculator.component.scss']
})
export class CalculatorComponent implements OnInit, AfterViewInit {
  private readonly timeout = 5000;

  // let keypad:[KeyType, KeyValue, string][]= [
  readonly buttonsConfig: [KeyType, KeyValue, string][] = [
    [KeyType.Clear, KeyValue.C, 'AC'],
    [KeyType.Number, KeyValue.PlusMinus, '±'],
    [KeyType.Number, KeyValue.Percent, '%'],
    [KeyType.Operator, KeyValue.Divide, '÷'],

    [KeyType.Number, KeyValue.Seven, '7'],
    [KeyType.Number, KeyValue.Eight, '8'],
    [KeyType.Number, KeyValue.Nine, '9'],
    [KeyType.Operator, KeyValue.Multiply, '×'],

    [KeyType.Number, KeyValue.Four, '4'],
    [KeyType.Number, KeyValue.Five, '5'],
    [KeyType.Number, KeyValue.Six, '6'],
    [KeyType.Operator, KeyValue.Subtract, '-'],

    [KeyType.Number, KeyValue.One, '1'],
    [KeyType.Number, KeyValue.Two, '2'],
    [KeyType.Number, KeyValue.Three, '3'],
    [KeyType.Operator, KeyValue.Add, '+'],

    [KeyType.Number, KeyValue.Zero, '0'],
    [KeyType.Number, KeyValue.Point, '.'],
    [KeyType.Enter, KeyValue.Enter, '=']
  ];

  @ViewChild('keypad', { static: false }) keypadContainerRef: ElementRef;
  private buttonsObservable: Observable<[KeyType, KeyValue]>;
  private operandObservable: Observable<string>;

  firstOperand: string;
  operator: string;
  secondOperand: string;
  isActiveFirst = true;

  constructor() { }

  ngOnInit() {
    // this.initButtonsObservable();
    // this.initOperandObservable();
  }

  ngAfterViewInit() {
    this.initButtonsObservable();
    this.initOperandObservable();
    setTimeout(() => { this.subscribe(); }, 100);
  }

  /**
   * 모든 button의 이벤트에 대한 observable를 준비한다.
   */
  private initButtonsObservable() {
    const buttonObservables = this.buttonsConfig.map(([keyType, keyValue, _], index) => {
      const button = this.keypadContainerRef.nativeElement.querySelectorAll('.calc-button')[index];
      return fromEvent<MouseEvent>(button, 'click').pipe( mapTo([keyType, keyValue] as [KeyType, KeyValue]) );
    });
    const buttonsOb = merge(buttonObservables).pipe( mergeAll() );

    this.buttonsObservable = buttonsOb.pipe( share() );
  }

  private initOperandObservable() {
    const enum InputMode {
      Decimal,
      Percent,
      Point
    }
    interface OperandState {
      inputMode: InputMode;
      isMinus: boolean;
      valueString: string;
      propagate: boolean;
    }

    const resetFnOb = this.buttonsObservable.pipe(
      filter(([keyType, _]) => (keyType === KeyType.Operator || keyType === KeyType.Enter) ? true : false),
      mapTo((state: OperandState) => {
        state.inputMode = InputMode.Decimal;
        state.valueString = '0';
        state.propagate = false;
        return state;
      })
    );

    const clearFnOb = this.buttonsObservable.pipe(
      filter(([_, keyValue]) => (keyValue === KeyValue.C) ? true : false),
      mapTo((state: OperandState) => {
        state.inputMode = InputMode.Decimal;
        state.valueString = '0';
        state.propagate = true;
        return state;
      })
    );

    const percentFnOb = this.buttonsObservable.pipe(
      filter(([_, keyValue]) => (keyValue === KeyValue.Percent) ? true : false),
      mapTo((state: OperandState): OperandState => {
        state.inputMode = InputMode.Percent;
        state.valueString = new Decimal(state.valueString).div(100).valueOf();
        state.propagate = true;
        return state;
      })
    );

    const pointFnOb = this.buttonsObservable.pipe(
      filter(([_, keyValue]) => (keyValue === KeyValue.Point) ? true : false),
      mapTo((state: OperandState) => {
        if (state.inputMode === InputMode.Decimal) {
          state.inputMode = InputMode.Point;
          state.valueString = state.valueString + '.';
        } else if (state.inputMode === InputMode.Percent) {
          state.inputMode = InputMode.Point;
          state.valueString = '0.';
        } else {
          // ignore
        }
        state.propagate = true;
        return state;
      })
    );

    const signFnOb = this.buttonsObservable.pipe(
      filter(([_, keyValue]) => (keyValue === KeyValue.PlusMinus) ? true : false),
      mapTo((state: OperandState) => {
        const isPlus = state.valueString[0] !== '-';
        state.valueString = isPlus ? '-' + state.valueString : state.valueString.slice(1);
        state.propagate = true;
        return state;
      })
    );

    const numberFnOb = this.buttonsObservable.pipe(
      filter(([_, keyValue]) => (keyValue >= KeyValue.Zero && keyValue <= KeyValue.Nine) ? true : false),
      map(([_, keyValue]) => {
        return (state: OperandState) => {
          switch (state.inputMode) {
            case InputMode.Decimal:
              if (state.valueString === '0' || state.valueString === '-0') {
                state.valueString = state.valueString.slice(state.valueString.length - 0);
              }
            // pass through
            // tslint:disable-next-line: no-switch-case-fall-through
            case InputMode.Point:
              state.valueString += keyValue.toString();
              break;

            case InputMode.Percent:
              state.valueString = keyValue.toString();
              state.inputMode = InputMode.Decimal;
              break;
          }

          state.propagate = true;
          return state;
        };
      })
    );

    this.operandObservable = merge(resetFnOb, percentFnOb, clearFnOb, pointFnOb, signFnOb, numberFnOb).pipe(
      mergeMap(changeFn => {
        const source = of(changeFn);
        const timeout = timer(this.timeout).pipe(
          mapTo((state: OperandState) => {
            state.inputMode = InputMode.Decimal;
            state.valueString = '0';
            state.propagate = false;
            return state;
          }),
          tap(value => console.log('timeout => C')),
          takeUntil(this.buttonsObservable)
        );

        return merge(source, timeout);
      }),
      scan((state, changeFn) => {
        const newState = changeFn(state);
        return newState;
      }, {
        inputMode: InputMode.Decimal,
        isMinus: false,
        valueString: '0',
        propagate: true
      }),
      tap(state => {
        this.updateClearButtonText(state.valueString === '0' || state.valueString === '-0' ? 'AC' : 'C');
      }),
      mergeMap(state => {
        return state.propagate ? of(state.valueString) : EMPTY;
      })
    );
  }

  private subscribe() {
    //                      N            +         =
    //  WaitFirst      ChangeFirst  WaitSecond     -
    //  ChangeFirst         -       WaitSecond  WaitFirst
    //  WaitSecond     ChangeSecond      -      WaitFirst
    //  ChangeSecond        -       WaitSecond  WaitFirst

    interface CalculatorState {
      step: Step;
      first: string;
      second: string;
      operator: KeyValue;
      skipOperand: boolean;
    }

    const operand = this.operandObservable.pipe(
      map(operand$ => (state: CalculatorState) => {
        console.log(`---- operand : ${operand$}`);
        if (state.skipOperand) {
          state.skipOperand = false;
          return state;
        }
        switch (state.step) {
          case Step.WaitFirst:
            state.step = Step.ChangeFirst;
          // path through
          // tslint:disable-next-line: no-switch-case-fall-through
          case Step.ChangeFirst:
            state.first = operand$;
            break;

          case Step.WaitSecond:
            state.step = Step.ChangeSecond;
          // path through
          // tslint:disable-next-line: no-switch-case-fall-through
          case Step.ChangeSecond:
            state.second = operand$;
            break;
        }
        return state;
      })
    );

    const enter = this.buttonsObservable.pipe(
      filter(([keyType, _]) => (keyType === KeyType.Enter) ? true : false),
      map(([_, keyValue]) => (state: CalculatorState) => {
        console.log(`---- enter`);
        if (state.step === Step.WaitSecond) {
          state.second = state.first;
        }

        state.first = this.decimalOperation(state.first, state.second, state.operator);
        state.step = Step.WaitFirst;
        return state;
      })
    );

    const clear = this.buttonsObservable.pipe(
      filter(([keyType, _]) => (keyType === KeyType.Clear) ? true : false),
      map(([_, keyValue]) => (state: CalculatorState) => {
        console.log(`---- clear`);
        if ((state.step === Step.WaitFirst || state.step === Step.ChangeFirst) && (state.first === '0' || state.first === '-0') ||
          (state.step === Step.WaitSecond || state.step === Step.ChangeSecond) && (state.second === '0' || state.second === '-0')) {
          state.first = '0';
          state.second = '0';
          state.step = Step.WaitFirst;
          state.operator = KeyValue.Add;
          state.skipOperand = true;
        }

        return state;
      })
    );

    const operator = this.buttonsObservable.pipe(
      filter(([keyType, _]) => (keyType === KeyType.Operator) ? true : false),
      map(([_, keyValue]) => (state: CalculatorState) => {
        console.log(`---- operator ${keyValue}`);
        if (state.step === Step.ChangeSecond) {
          state.first = this.decimalOperation(state.first, state.second, keyValue);
        }

        state.step = Step.WaitSecond;
        state.operator = keyValue;
        return state;
      })
    );

    merge(clear, enter, operator, operand).pipe(
      mergeMap(changeFn => {
        const source = of(changeFn);
        const timeout = timer(this.timeout).pipe(
          mapTo((state: CalculatorState) => {
            state.first = '0';
            state.second = '0';
            state.step = Step.WaitFirst;
            state.operator = KeyValue.Add;
            state.skipOperand = false;
            return state;
          }),
          tap(value => console.log('timeout => AC')),
          takeUntil(this.buttonsObservable)
        );

        return merge(source, timeout);
      }),
      scan((state, changeFn) => {
        // console.log('\n>>>> BEFORE ');
        // console.log(state);
        const newState = changeFn(state);
        // console.log('<<<< AFTER ');
        // console.log(newState);
        return newState;
      }, {
        step: Step.WaitFirst,
        first: '0',
        second: '0',
        operator: KeyValue.Add,
        skipOperand: false
      }),
      startWith({
        step: Step.WaitFirst,
        first: '0',
        second: '0',
        operator: KeyValue.Add
      }),
    ).subscribe((state: CalculatorState) => {
        this.changeActiveDisplay(state.step === Step.WaitFirst || state.step === Step.ChangeFirst ? true : false);
        this.updateFirstOperand(state.first);
        this.updateOperator(state.operator === KeyValue.Add ? '+' :
          state.operator === KeyValue.Subtract ? '-' :
            state.operator === KeyValue.Multiply ? '×' :
              '÷');
        this.updateSecondOperand(state.second);
      });
  }

  private decimalOperation(first: string, second: string, operator: KeyValue) {
    let result: string;

    switch (operator) {
      case KeyValue.Add:
        result = new Decimal(first).plus(second).valueOf();
        break;

      case KeyValue.Subtract:
        result = new Decimal(first).minus(second).valueOf();
        break;

      case KeyValue.Multiply:
        result = new Decimal(first).times(second).valueOf();
        break;

      case KeyValue.Divide:
        result = new Decimal(first).dividedBy(second).valueOf();
        break;

      default:
        console.log('ERROR: unexpected operator');
        break;
    }

    return result;
  }

  private updateFirstOperand(value: string) {
    this.firstOperand = numberWithCommas(value);
  }

  private updateOperator(value: string) {
    this.operator = value;
  }

  private updateSecondOperand(value: string) {
    this.secondOperand = numberWithCommas(value);
  }

  private updateClearButtonText(value: string) {
    this.buttonsConfig[0]['2'] = value;
  }

  private changeActiveDisplay(isFirst: boolean) {
    this.isActiveFirst = isFirst;
  }
}
