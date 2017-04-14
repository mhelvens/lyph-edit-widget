import $ from '../libs/jquery.js';

import {isNumber as _isNumber} from 'lodash';

import {pick, isArray} from 'lodash-bound';

import {property} from '../util/ValueTracker.js';
import ObservableSet, {copySetContent} from "../util/ObservableSet";
import {flag} from "../util/ValueTracker";
import NodeGlyph from "./NodeGlyph";
import LyphRectangle from "./LyphRectangle";
import MeasurableGlyph from "./MeasurableGlyph";
import {ID_MATRIX} from '../util/svg';
import Transformable from "./Transformable";
import {tap} from "../util/rxjs";

const $$backgroundColor = Symbol('$$backgroundColor');
const $$toBeRecycled    = Symbol('$$toBeRecycled');
const $$recycle = Symbol('$$recycle');


export default class BorderLine extends Transformable {
	
	@property({ isValid: _isNumber }) x1;
	@property({ isValid: _isNumber }) y1;
	@property({ isValid: _isNumber }) x2;
	@property({ isValid: _isNumber }) y2;
	
	@property({ isValid: _isNumber }) x;
	@property({ isValid: _isNumber }) y;
	
	@flag(false) isInnerBorder;
	
	freeFloatingStuff = new ObservableSet();
	
	get width()  { return Math.abs(this.x1 - this.x2) }
	get height() { return Math.abs(this.y1 - this.y2) }
	
	constructor(options) {
		super(options);
		this.setFromObject(options, [
			'x1', 'x2', 'x',
			'y1', 'y2', 'y',
			'resizes', 'isInnerBorder'
		], { free: false });
		
		/* sync x1,x2,y1,y2,x,y,width,height */
		this.p(['x1', 'x2'], Math.min).subscribe( this.pSubject('x') );
		this.p(['y1', 'y2'], Math.min).subscribe( this.pSubject('y') );
		this.p('x').filter(() => this.x1 === this.x2).subscribe((x) => { this.x1 = this.x2 = x });
		this.p('y').filter(() => this.y1 === this.y2).subscribe((y) => { this.y1 = this.y2 = y });
		
		this[$$toBeRecycled] = new WeakMap();
	}
	
	[$$recycle](model) {
		if (!this[$$toBeRecycled].has(model)) { return false }
		let result = this[$$toBeRecycled].get(model);
		this[$$toBeRecycled].delete(model);
		return result;
	}
	
	createElement() {
		const group = this.root.gElement();
		
		             group.g().addClass('fixed main-shape');
		let handle = group.g().addClass('fixed handle');
		             group.g().addClass('fixed nodes');
		             group.g().addClass('fixed measurables');
		
		/* return representation(s) of element */
		return {
			element: group.node,
			handle:  handle.node
		};
	}
	
	async afterCreateElement() {
		await super.afterCreateElement();
		
		let group = this.inside.svg;
		
		{
			let mainShapeGroup = this.inside.svg.select('.main-shape');
			
			let line = mainShapeGroup.line().attr({
				strokeWidth   : '2px',
				shapeRendering: 'crispEdges',
				pointerEvents : 'none',
				strokeLinecap : 'square'
			});
			
			/* manifest coordinates in the DOM */
			this.p('x1').subscribe(x1 => line.attr({ x1 }));
			this.p('x2').subscribe(x2 => line.attr({ x2 }));
			this.p('y1').subscribe(y1 => line.attr({ y1 }));
			this.p('y2').subscribe(y2 => line.attr({ y2 }));
			
			/* manifest nature in the DOM */
			this.model.p('nature')
				.map(n => n::isArray() ? n : [n])
				.map(n => ({ stroke: n.length === 1 && n[0] === 'open' ? '#aaaaa' : 'black' }))
				.subscribe( ::line.attr );
			
			// this.findAncestor(a => a.free).inside.jq
			//     .children('.foreground')
			//     .append(lineGroup.node);
		}
		// {
		// 	let highlightBorderGroup = group.g().attr({
		// 		pointerEvents : 'none'
		// 	});
		//
		// 	highlightBorderGroup.rect().attr({
		// 		stroke:      'black',
		// 		strokeWidth: '3px'
		// 	});
		// 	highlightBorderGroup.rect().attr({
		// 		stroke:      'white',
		// 		strokeWidth: '1px'
		// 	});
		// 	let rects = highlightBorderGroup.selectAll('rect').attr({
		// 		fill:            'none',
		// 		shapeRendering:  'crispEdges',
		// 		pointerEvents :  'none',
		// 		strokeDasharray: '8, 5', // 13
		// 		strokeDashoffset: 0
		// 	});
		// 	Observable.interval(1000/60)
		// 		.map(n => ({ strokeDashoffset: -(n / 3 % 13) }))
		// 		.subscribe( ::rects.attr );
		//
		// 	this.p(['selected', 'dragging'], (selected, dragging) => ({
		// 		visibility: (selected && !dragging) ? 'visible' : 'hidden'
		// 	})).subscribe( ::highlightBorderGroup.attr );
		//
		// 	this.p(['x1', 'x2', 'y1', 'y2'], (x1, x2, y1, y2) => ({
		// 		x:      Math.min(x1, x2) - 4,
		// 		y:      Math.min(y1, y2) - 4,
		// 		width:  Math.abs(x1-x2) + 8,
		// 		height: Math.abs(y1-y2) + 8
		// 	})).subscribe( ::rects.attr );
		//
		// 	// this.findAncestor(a => a.free).inside.jq
		// 	//     .children('.foreground')
		// 	//     .append(highlightBorderGroup.node);
		// 	// $('#foreground').append(result.node);
		//
		// 	// TODO: put this in SelectTool.js; Why wasn't this easy??
		// }
		{
			let hitBoxGroup = this.handle.svg;
			
			$(hitBoxGroup.node)
				.css({ opacity: 0 })
				.attr('controller', ''+this)
				.association('controller', this);
			
			this.p('parent.free')
				.subscribe((free) => { hitBoxGroup.attr({ pointerEvents: free ? 'inherit' : 'none' }) });
			
			let rectangle = hitBoxGroup.rect();
			
			this.p(['x1', 'x2', 'y1', 'y2']).subscribe(([x1, x2, y1, y2]) => {
				if (x1 === x2) {
					rectangle.attr({
						x: x1-2,
						y: y1,
						width: 5,
						height: Math.abs(y1 - y2)
					});
				} else {
					rectangle.attr({
						x: x1,
						y: y1-2,
						width: Math.abs(x1 - x2),
						height: 5
					});
				}
			});
			
			this.parent.inside.jq
			    .children('.borders')
			    .append(this.handle);
		}
		{
			this.freeFloatingStuff.e('add').subscribe( this.children.e('add') );
			this.children.e('delete').subscribe( this.freeFloatingStuff.e('delete') );
			this.syncModelWithArtefact(
				'ContainsNode',
				NodeGlyph,
				this.inside.jq.children('.nodes'),
				({model, x1, x2, y1, y2}) => new NodeGlyph({
					model,
					x: (x1+x2)/2, // TODO: pick unique new position and size (auto-layout)
					y: (y1+y2)/2, //
				})
			);
		}
		{
			this.freeFloatingStuff.e('add').subscribe( this.children.e('add') );
			this.children.e('delete').subscribe( this.freeFloatingStuff.e('delete') );
			this.syncModelWithArtefact(
				'HasMeasurable',
				MeasurableGlyph,
				this.inside.jq.children('.measurables'),
				({model, x1, x2, y1, y2}) => new MeasurableGlyph({
					model,
					x: (x1+x2)/2, // TODO: pick unique new position and size (auto-layout)
					y: (y1+y2)/2, //
				})
			);
		}
	}
	
	
	syncModelWithArtefact(relationship, cls, parentElement, createNewArtefact) {
		/* new free-floating thing in the model --> new artifact */
		this.model[`-->${relationship}`].e('add')
			.filter(c => c.class === relationship)
			.map(c=>c[2])
			.withLatestFrom(this.p('x1'), this.p('x2'), this.p('y1'), this.p('y2'))
			.map(([model, x1, x2, y1, y2]) =>
				this[$$recycle](model) ||
				createNewArtefact({ model, x1, x2, y1, y2 }))
			.do((artefact) => { artefact.free = true })
			.subscribe( this.freeFloatingStuff.e('add') );
		/* new part artifact --> house svg element */
		this.freeFloatingStuff.e('add')
		    .subscribe((artefact) => {
			    /* event when removed */
			    const removed = artefact.p('parent').filter(p=>p!==this);
		    	/* put into the dom */
				parentElement.append(artefact.element);
			    /* move when the border moves */
			    let transformation = artefact.transformation;
			    let initial = this::pick('x1', 'x2', 'y1', 'y2');
			    if (initial.x1 === initial.x2) {
			    	this.p('x1')
					    .takeUntil(removed)
					    .map(x1 => ID_MATRIX.translate(x1 - initial.x1, 0).multiply(transformation))
					    .subscribe( artefact.p('transformation') );
			    } else if (initial.y1 === initial.y2) {
				    this.p('y1')
					    .takeUntil(removed)
					    .map(y1 => ID_MATRIX.translate(0, y1 - initial.y1).multiply(transformation))
					    .subscribe( artefact.p('transformation') );
			    }
			    /* remove from dom when removed */
				removed.subscribe(() => {
					if (artefact.element.jq.parent()[0] === parentElement) {
						artefact.element.jq.remove();
					}
				});
			});
	}
	
	drop(droppedEntity, originalDropzone = this) {
		if ([LyphRectangle].includes(droppedEntity.constructor)) {
			return this.parent.drop(droppedEntity, originalDropzone);
		} else if ([NodeGlyph, MeasurableGlyph].includes(droppedEntity.constructor)) {
			this[$$toBeRecycled].set(droppedEntity.model, droppedEntity);
			this.freeFloatingStuff.add(droppedEntity, { force: true });
		} else {
			return false;
		}
	}
	
	
}
