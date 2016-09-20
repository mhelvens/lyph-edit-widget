import $ from 'jquery';
import {fromEvent} from 'rxjs/observable/fromEvent';
import {of} from 'rxjs/observable/of';
import {combineLatest} from 'rxjs/observable/combineLatest';
import {switchMap} from 'rxjs/operator/switchMap';
import {filter} from 'rxjs/operator/filter';
import {takeUntil} from 'rxjs/operator/takeUntil';
import {withLatestFrom} from 'rxjs/operator/withLatestFrom';
import {take} from 'rxjs/operator/take';
import {map} from 'rxjs/operator/map';
import {concat} from 'rxjs/operator/concat';

import assign from 'lodash-bound/assign';
import pick from 'lodash-bound/pick';
import isFunction from 'lodash-bound/isFunction';
import defaults from 'lodash-bound/defaults';

import Tool from './Tool';
import {withoutMod} from "../util/misc";
import {stopPropagation} from "../util/misc";
import {shiftedMovementFor, log} from "../util/rxjs";
import {afterMatching} from "../util/rxjs";
import {shiftedMatrixMovementFor} from "../util/rxjs";
import {POINT, ID_MATRIX} from "../util/svg";
import {never} from "rxjs/observable/never";
import {ignoreElements} from "rxjs/operator/ignoreElements";
import {skipUntil} from "rxjs/operator/skipUntil";
import {delay} from "rxjs/operator/delay";
import {skip} from "rxjs/operator/skip";
import {subscribe_} from "../util/rxjs";
import {shiftedMMovementFor} from "../util/rxjs";
import {tap} from "../util/rxjs";
import {mapTo} from "rxjs/operator/mapTo";
import Machine from "../util/Machine";
import {emitWhenComplete} from "../util/rxjs";
import {tX} from "../util/svg";
import {tY} from "../util/svg";
import {Vector2D} from "../util/svg";
import {rotateAround} from "../util/svg";
import minBy from "lodash-bound/minBy";
import {newSVGPoint} from "../util/svg";

const {abs, sqrt} = Math;


function reassessHoveredArtefact(a) {
	if (!a){ return }
	a.element.jq.mouseleave();
	reassessHoveredArtefact(a.parent);
	if (a.element.jq.is(':hover')) {
		a.element.jq.mouseenter();
	}
}


export default class DragDropTool extends Tool {
	
	constructor(context) {
		super(context, { events: ['mousedown', 'mouseenter'] });
		
		const mousemove = this.windowE('mousemove');
		const mouseup   = this.windowE('mouseup');
		
		
		// context.registerCursor((handleArtifact) => {
		// 	if (!handleArtifact.draggable) { return false }
		// 	let isDragging    = handleArtifact.p('dragging')::filter(d=>d);
		// 	let isNotDragging = handleArtifact.p('dragging')::filter(d=>!d);
		// 	let isSelected    = handleArtifact.p('selected')::filter(s=>s);
		// 	let isNotSelected = handleArtifact.p('selected')::filter(s=>!s);
		// 	let GRAB     = '-webkit-grab -moz-grab grab';
		// 	let GRABBING = '-webkit-grabbing -moz-grabbing grabbing';
		// 	return of(GRAB)::concat(isDragging
		// 		// ::takeUntil( combineLatest(isNotDragging::skip(1), isNotSelected::skip(1)::delay(100), (nd,ns)=>nd&&ns)::filter(v=>v) )
		// 		::switchMap(() => of(GRABBING)
		// 			::concat(never()::takeUntil(isNotDragging))
		// 			::concat(of(GRAB)))
		// 	);
		// });
		
		
		function snap45(moveEvent, movingArtefact, referencePoint) {
			let mouseVector = moveEvent.point.in(movingArtefact.element);
			if (referencePoint && moveEvent.ctrlKey) {
				let cReferencePoint = referencePoint.in(movingArtefact.element);
				let mouseVector45 = mouseVector.svgPoint
				                               .matrixTransform(ID_MATRIX::rotateAround(cReferencePoint, 45));
				mouseVector45 = new Vector2D({ x: mouseVector45.x, y: mouseVector45.y, context: movingArtefact.element });
				let cDiff = mouseVector.minus(cReferencePoint);
				let cDiff45 = mouseVector45.minus(cReferencePoint);
				const newPt = (xp, yp, m = ID_MATRIX) => new Vector2D({
					...newSVGPoint(xp.x, yp.y).matrixTransform(m)::pick('x', 'y'),
					context: movingArtefact.element
				});
				mouseVector = [
					{ diff: abs(cDiff.x), snap: () => newPt(cReferencePoint, mouseVector) },
					{ diff: abs(cDiff.y), snap: () => newPt(mouseVector, cReferencePoint) },
					{ diff: abs(cDiff45.x), snap: () => newPt(cReferencePoint, mouseVector45, ID_MATRIX::rotateAround(cReferencePoint, -45)) },
					{ diff: abs(cDiff45.y), snap: () => newPt(mouseVector45, cReferencePoint, ID_MATRIX::rotateAround(cReferencePoint, -45)) }
				]::minBy('diff').snap();
			}
			return mouseVector;
		}
		
		context.stateMachine.extend(({ enterState, subscribe }) => ({
			'IDLE': () => this.e('mousedown')
				::filter(withoutMod('ctrl', 'shift', 'meta'))
				::tap(stopPropagation)
				::withLatestFrom(context.p('selected'))
				::filter(([,handleArtifact]) => handleArtifact.draggable)
				::map(([downEvent, movingArtefact]) => ({mousedownVector: downEvent.point, movingArtefact}))
		        ::enterState('INSIDE_MOVE_THRESHOLD'),
			'INSIDE_MOVE_THRESHOLD': ({mousedownVector, movingArtefact}) => [
				mousemove
					::take(4)
					::ignoreElements()
					::emitWhenComplete({mousedownVector, movingArtefact})
					::enterState('MOVING'),
			    mouseup
				    ::enterState('IDLE')
				// TODO: go IDLE on pressing escape
			],
			'MOVING': ({mousedownVector, movingArtefact, referencePoint, reassessSelection = true}) =>  {
				/* start dragging */
				movingArtefact.dragging = true;
				if (reassessSelection) {
					for (let a of movingArtefact.traverse('post')) {
						a.element.jq.mouseleave();
					}
					reassessHoveredArtefact(movingArtefact.parent);
				}
				
				movingArtefact.moveToFront();
				
				/* record start dimensions */
				const transformationStart = movingArtefact.transformation;
				
				/* move while dragging */
				mousemove
					::subscribe((moveEvent) => {
						var mouseVector = snap45(moveEvent, movingArtefact, referencePoint);
						let translationDiff = mouseVector.minus(mousedownVector.in(movingArtefact.element));
						movingArtefact.transformation = transformationStart
							.translate(...translationDiff.xy);
					});
				
				/* stop dragging and drop */
				let initial_dragged_transformation = movingArtefact.transformation;
				let initial_dragged_parent         = movingArtefact.parent;
				mouseup
					::withLatestFrom(context.p('selected'))
					::tap(([,recipient]) => {
						/* either drop it on the recipient */
						let success = false;
						if (recipient.drop::isFunction()) {
							success = recipient.drop(movingArtefact, recipient) !== false;
						}
						/* or revert to previous state if recipient rejects it */
						if (!success) {
							movingArtefact::assign({
								transformation: initial_dragged_transformation,
								parent:         initial_dragged_parent
							});
						}
						/* stop dragging */
						movingArtefact.dragging = false;
				    })
					::enterState('IDLE');
			}
		}));
		
		
		
	}
	
	
	
}

