import $ from 'jquery';
import {fromEvent} from 'rxjs/observable/fromEvent';
import {of} from 'rxjs/observable/of';
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
import {shiftedMovementFor} from "../util/rxjs";
import {afterMatching} from "../util/rxjs";


export default class DragDropTool extends Tool {
	
	constructor(context) {
		super(context, { events: ['mousedown'] });
		
		const {root} = context;
		
		const mousemove = fromEvent($(window), 'mousemove');
		const mouseup   = fromEvent($(window), 'mouseup'  );
		
		this.e('mousedown')
			::filter(withoutMod('ctrl', 'shift', 'meta'))
			.do(stopPropagation)
			::withLatestFrom(context.p('selected'))
			::afterMatching(mousemove::take(4), mouseup)
			::filter(([,draggedArtefact]) => draggedArtefact.draggable)
			.subscribe(([down, draggedArtefact]) => {
				
				/* start dragging */
				draggedArtefact.dragging = true;
				draggedArtefact.element.jq.appendTo(root.inside.jq.children('.foreground'));
				for (let a of draggedArtefact.traverse('post')) {
					a.element.jq.mouseleave();
				}
				
				/* move while dragging */
				of(down)::concat(mousemove::takeUntil(mouseup))
					::map(::this.xy_viewport_to_canvas)
					::shiftedMovementFor(draggedArtefact.pObj(['x', 'y']))
					.subscribe( draggedArtefact::assign );
				
				/* stop dragging and drop */
				let initial_dragged_xy     = draggedArtefact::pick('x', 'y');
				let initial_dragged_parent = draggedArtefact.parent;
				mouseup::withLatestFrom(context.p('selected'))::take(1)
					.subscribe(([up, recipient]) => {
						
						/* either drop it on the recipient */
						let success = false;
						if (recipient && recipient.drop::isFunction()) {
							success = recipient.drop(draggedArtefact, recipient) !== false;
						}
						
						if (!success) {
							draggedArtefact::assign(initial_dragged_xy);
							draggedArtefact.parent = initial_dragged_parent;
						}
						
						/* stop dragging */
						draggedArtefact.dragging = false;
						// draggedArtefact.element.jq.mouseenter(); // glitches if the mouse is already outside of it, so it won't mouseleave
				    });
				
			});
		
	}
	
	
	
}

